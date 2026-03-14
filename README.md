# 🦊 GitLab Handbook Assistant

An AI-powered chat assistant that lets you ask any question about the [GitLab Handbook](https://handbook.gitlab.com/). It crawls the handbook at startup, builds a semantic vector index, and answers questions using Retrieval-Augmented Generation (RAG) with Google Gemini.

---

## ✨ Features

- 🕷️ **Live Web Crawler** — Automatically crawls up to 120 pages of the GitLab Handbook on startup
- 🧠 **RAG Pipeline** — Embeds documents with a local HuggingFace model and indexes them for semantic search
- 💬 **AI Chat** — Powered by Google Gemini 2.5 Flash for fast, accurate answers
- 📡 **Real-time Progress** — Server-Sent Events (SSE) stream crawl & indexing progress to the UI
- ⚛️ **Modern Frontend** — React + TypeScript + Tailwind CSS with smooth Framer Motion animations
- 🐳 **Docker Ready** — Single `Dockerfile` for containerized deployment

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Browser (React)                    │
│  Welcome → Loader (SSE progress) → Chat Interface       │
└───────────────────┬─────────────────────────────────────┘
                    │  HTTP / SSE
┌───────────────────▼─────────────────────────────────────┐
│              Backend (Express + LlamaIndex)              │
│                                                         │
│  1. Crawl handbook.gitlab.com  (Cheerio)                │
│  2. Embed documents            (HuggingFace MiniLM)     │
│  3. Build vector index         (LlamaIndex in-memory)   │
│  4. Answer queries             (Gemini 2.5 Flash)       │
└─────────────────────────────────────────────────────────┘
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, Framer Motion |
| **Markdown** | react-markdown, remark-gfm, react-syntax-highlighter |
| **Backend** | Node.js, Express, TypeScript, tsx |
| **AI / RAG** | LlamaIndex, Google Gemini 2.5 Flash, HuggingFace MiniLM-L6-v2 |
| **Scraping** | Cheerio |
| **Config** | dotenv |
| **Container** | Docker |

---

## 📁 Project Structure

```
gitlab-assistant/
├── Dockerfile
├── package.json           # Root scripts (dev, install:all)
├── .gitignore
│
├── backend/
│   ├── server.ts          # Express server, crawler, RAG pipeline
│   ├── package.json
│   └── tsconfig.json
│
└── frontend/
    ├── index.html
    ├── vite.config.ts
    ├── tailwind.config.js
    ├── package.json
    └── src/
        ├── App.tsx         # Root component & phase state machine
        ├── api.ts          # Backend API calls
        ├── types.ts        # Shared TypeScript types
        ├── components/
        │   ├── Header.tsx
        │   ├── Welcome.tsx          # Suggestion chips
        │   ├── Loader.tsx           # SSE progress display
        │   ├── MessageBubble.tsx    # Chat message renderer
        │   ├── InputBar.tsx         # Chat input
        │   ├── CodeBlock.tsx        # Syntax-highlighted code
        │   └── TypingIndicator.tsx
        └── hooks/
            ├── useChat.ts           # Chat state & API logic
            └── useBackendReady.ts   # SSE connection hook
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** v18 or later
- **npm** v9 or later
- A **Google Gemini API key** ([get one here](https://aistudio.google.com/app/apikey))

### 1. Clone the repository

```bash
git clone https://github.com/your-username/gitlab-assistant.git
cd gitlab-assistant
```

### 2. Install dependencies

```bash
npm run install:all
```

This installs packages for both `backend/` and `frontend/`.

### 3. Configure environment variables

Create a `.env` file in the `backend/` directory:

```bash
cp backend/.env.example backend/.env   # if example exists, otherwise:
touch backend/.env
```

Add your Gemini API key:

```env
GOOGLE_API_KEY=your_gemini_api_key_here
PORT=3001                   # optional, defaults to 3001
```

### 4. Start the backend

```bash
cd backend
npm run dev
```

The server will start on `http://localhost:3001`. It will immediately begin crawling the GitLab Handbook (~120 pages) and building the vector index. This takes **2–5 minutes** on first run.

### 5. Start the frontend

In a new terminal:

```bash
npm run dev
# or
cd frontend && npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🐳 Docker

Build and run the entire application in a single container:

```bash
docker build -t gitlab-assistant .
docker run -p 3001:3001 -e GOOGLE_API_KEY=your_key_here gitlab-assistant
```

---

## 🔌 API Reference

### `GET /health`
Returns whether the backend has finished indexing and is ready to answer queries.

```json
{ "ready": true }
```

### `GET /progress`
Server-Sent Events stream. Emits progress events during startup:

| Event type | Payload |
|------------|---------|
| `crawling` | `{ url, count, total }` |
| `chunking` | `{ count }` |
| `indexing` | `{}` |
| `ready`    | `{}` |

### `POST /chat`
Send a question and receive an AI-generated answer.

**Request:**
```json
{ "message": "What is GitLab's approach to remote work?" }
```

**Response:**
```json
{ "response": "GitLab is an all-remote company..." }
```

**Error responses:**
- `400` — `message` field missing or invalid
- `503` — Backend still initializing
- `500` — Query failed

---

## 🔄 How It Works

1. **Startup** — The Express server launches and kicks off the crawler.
2. **Crawling** — Cheerio fetches and parses `handbook.gitlab.com/handbook/` pages, following internal links up to the `MAX_PAGES` limit (120). Progress is broadcast via SSE.
3. **Embedding** — Each page's text content is embedded using the local `all-MiniLM-L6-v2` model from HuggingFace (runs entirely in-process, no external API call).
4. **Indexing** — LlamaIndex builds an in-memory vector store from all embeddings.
5. **Querying** — User questions are embedded and the top-6 most similar chunks are retrieved, then passed to Gemini 2.5 Flash as context to generate an answer.
6. **UI Flow** — The React app uses a phase state machine: `idle → loading (SSE) → chat`.

---

## ⚙️ Configuration

| Variable | Location | Default | Description |
|----------|----------|---------|-------------|
| `GOOGLE_API_KEY` | `backend/.env` | — | **Required.** Google Gemini API key |
| `PORT` | `backend/.env` | `3001` | Backend server port |
| `MAX_PAGES` | `backend/server.ts` | `120` | Max handbook pages to crawl |
| `START_URL` | `backend/server.ts` | `handbook.gitlab.com/handbook/` | Crawl entry point |

---

## 📄 License

MIT

