
FROM node:20-bookworm-slim AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package.json ./
RUN npm install

COPY frontend/ ./
RUN npm run build

FROM node:20-bookworm-slim AS backend-builder

WORKDIR /app/backend

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY backend/package.json ./
RUN npm install

COPY backend/ ./

FROM node:20-bookworm-slim

WORKDIR /app

COPY --from=backend-builder /app/backend ./backend
COPY --from=frontend-builder /app/frontend/dist ./backend/public

WORKDIR /app/backend

EXPOSE 3001

CMD ["npx", "tsx", "server.ts"]
