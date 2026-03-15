const BASE = "https://gitlab-assitance-1.onrender.com";

export async function sendMessage(message: string): Promise<string> {
    const res = await fetch(`${BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Request failed");
    }
    const data = (await res.json()) as { response: string };
    return data.response;
}

export async function checkHealth(): Promise<boolean> {
    try {
        const res = await fetch(`${BASE}/health`);
        if (!res.ok) return false;
        const data = (await res.json()) as { ready: boolean };
        return data.ready === true;
    } catch {
        return false;
    }
}

export type ProgressEvent =
    | { type: "crawling"; url: string; count: number; total: number }
    | { type: "chunking"; count: number }
    | { type: "indexing" }
    | { type: "ready" };

export function subscribeToProgress(
    onEvent: (e: ProgressEvent) => void,
    onReady: () => void
): () => void {
    const es = new EventSource(`${BASE}/progress`);

    es.onmessage = (msg) => {
        try {
            const event = JSON.parse(msg.data) as ProgressEvent;
            onEvent(event);
            if (event.type === "ready") {
                onReady();
                es.close();
            }
        } catch {
        }
    };

    es.onerror = () => {
    };

    return () => es.close();
}