import "dotenv/config";
import express from "express";
import cors from "cors";
import * as cheerio from "cheerio";
import { Document, VectorStoreIndex, Settings } from "llamaindex";
import { Gemini, GEMINI_MODEL } from "@llamaindex/google";
import {
    HuggingFaceEmbedding,
    HuggingFaceEmbeddingModelType,
} from "@llamaindex/huggingface";
import path from "path";
import { fileURLToPath } from "url";


Settings.llm = new Gemini({ model: GEMINI_MODEL.GEMINI_2_5_FLASH_LATEST });
Settings.embedModel = new HuggingFaceEmbedding({
    modelType: HuggingFaceEmbeddingModelType.XENOVA_ALL_MINILM_L6_V2,
});

const BASE_URL = "https://handbook.gitlab.com";
const START_URL = "https://handbook.gitlab.com/handbook/";
const MAX_PAGES = 120;
const visited = new Set<string>();

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPage(url: string) {
    try {
        const res = await fetch(url, {
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 Chrome/122 Safari/537.36",
            },
        });
        return await res.text();
    } catch {
        return null;
    }
}

// ── SSE clients ──────────────────────────────────────────
type SSEClient = {
    id: number;
    res: express.Response;
};

let sseClients: SSEClient[] = [];
let sseClientId = 0;

export type ProgressEvent =
    | { type: "crawling"; url: string; count: number; total: number }
    | { type: "chunking"; count: number }
    | { type: "indexing" }
    | { type: "ready" };

function broadcast(event: ProgressEvent) {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    sseClients.forEach((client) => client.res.write(data));
}

// ── Crawler ──────────────────────────────────────────────
async function crawl() {
    const queue = [START_URL];
    const docs: Document[] = [];

    while (queue.length && visited.size < MAX_PAGES) {
        const url = queue.shift()!;
        if (visited.has(url)) continue;
        visited.add(url);

        console.log(`[crawler] (${visited.size}/${MAX_PAGES}) ${url}`);

        // Broadcast to SSE clients
        broadcast({ type: "crawling", url, count: visited.size, total: MAX_PAGES });

        const html = await fetchPage(url);
        if (!html) continue;

        const $ = cheerio.load(html);
        const text = $("main").text();
        docs.push(new Document({ text, metadata: { url } }));

        $("a").each((_, el) => {
            const link = $(el).attr("href");
            if (!link) return;
            let fullUrl = "";
            if (link.startsWith("http")) fullUrl = link;
            else if (link.startsWith("/")) fullUrl = BASE_URL + link;
            if (fullUrl.includes("/handbook/") && !visited.has(fullUrl))
                queue.push(fullUrl);
        });

        await sleep(500);
    }

    return docs;
}

// ── Express ──────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

let queryEngine: Awaited<ReturnType<VectorStoreIndex["asQueryEngine"]>> | null = null;
let ready = false;

app.get("/health", (_req, res) => {
    res.json({ ready });
});

// SSE stream endpoint
app.get("/progress", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const id = sseClientId++;
    sseClients.push({ id, res });

    // If already ready, immediately tell this client
    if (ready) {
        res.write(`data: ${JSON.stringify({ type: "ready" })}\n\n`);
    }

    req.on("close", () => {
        sseClients = sseClients.filter((c) => c.id !== id);
    });
});

app.post("/chat", async (req, res) => {
    const { message } = req.body as { message: string };
    if (!message || typeof message !== "string") {
        return res.status(400).json({ error: "message is required" });
    }
    if (!ready || !queryEngine) {
        return res.status(503).json({ error: "Backend still initializing." });
    }
    try {
        const result = await queryEngine.query({ query: message });
        return res.json({ response: result.toString() });
    } catch (err) {
        console.error("[chat] Error:", err);
        return res.status(500).json({ error: "Query failed" });
    }
});

// Serve frontend build when running inside the production container.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
app.use(express.static(publicDir));
app.get(/^(?!\/(health|progress|chat)\b).*/, (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
});

// ── Init ─────────────────────────────────────────────────
async function init() {
    const PORT = process.env.PORT ?? 3001;

    app.listen(PORT, () => {
        console.log(`[server] http://localhost:${PORT}`);
    });

    console.log("[server] Crawling handbook...");
    const documents = await crawl();
    console.log(`[server] Crawled ${documents.length} pages`);

    broadcast({ type: "chunking", count: documents.length });
    console.log("[server] Building vector index...");

    broadcast({ type: "indexing" });
    const index = await VectorStoreIndex.fromDocuments(documents);
    queryEngine = index.asQueryEngine({ similarityTopK: 6 });

    ready = true;
    broadcast({ type: "ready" });
    console.log("[server] ✓ Ready!");
}

init();