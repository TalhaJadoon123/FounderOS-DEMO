# ---------------------------------------------------------------
# Founder OS — Dockerfile
# Multi-stage build: deps → build → run
# ---------------------------------------------------------------

# ---- Build stage ------------------------------------------------
FROM node:22-bookworm AS builder

WORKDIR /app

# better-sqlite3 is a native addon; these let it build from source
# if no prebuilt binary matches the container.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy lockfile + manifest first for layer caching.
COPY package.json package-lock.json .npmrc* ./
# Copy postinstall script so npm can find it during install (it's in the
# source tree but we only copy package files before install for caching).
COPY scripts/postinstall.mjs ./scripts/postinstall.mjs
RUN npm ci

# Copy the rest of the source.
COPY . .

# Build Next.js (standalone output is intentionally NOT used; we run
# `next start` from the source tree so outputFileTracing stays off).
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- Run stage --------------------------------------------------
FROM node:22-bookworm AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# The app listens on 4100 by default; PORT overrides it.
ENV PORT=4100

# Runtime deps for better-sqlite3 (libsqlite3 shared library).
RUN apt-get update && apt-get install -y --no-install-recommends \
    libsqlite3-0 \
    && rm -rf /var/lib/apt/lists/*

# Only production deps are needed to run.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.mjs ./next.config.mjs
COPY --from=builder /app/middleware.ts ./middleware.ts
COPY --from=builder /app/instrumentation.ts ./instrumentation.ts
COPY --from=builder /app/public ./public
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/app ./app
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# Data directory for the SQLite DB (persisted via volume in compose).
ENV DATA_DIR=/data
ENV FOUNDER_OS_DB=/data/founder-os.db

EXPOSE 4100

# Health check: the app's own /api/health endpoint.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:${PORT:-4100}/api/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

# Next.js 14 production server. `outputFileTracing` is off in next.config.mjs,
# so we run `next start` from the source tree (no standalone output).
CMD ["npx", "next", "start", "-p", "4100"]

