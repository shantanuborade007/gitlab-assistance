# Stage 1: Build frontend
FROM node:20-bookworm-slim AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package.json ./
RUN npm install

COPY frontend/ ./
RUN npm run build

# Stage 2: Build backend dependencies
FROM node:20-bookworm-slim AS backend-builder

WORKDIR /app/backend

# Build tools for native npm modules (node-gyp)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY backend/package.json ./
RUN npm install

COPY backend/ ./

# Stage 3: Final runtime image
FROM node:20-bookworm-slim

WORKDIR /app

COPY --from=backend-builder /app/backend ./backend
COPY --from=frontend-builder /app/frontend/dist ./backend/public

WORKDIR /app/backend

EXPOSE 3001

CMD ["npx", "tsx", "server.ts"]
