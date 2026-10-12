# Build context: repository root (docker build -f server/Dockerfile .)
FROM oven/bun:1-alpine AS deps
WORKDIR /app
COPY server/package.json server/bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY --from=deps --chown=bun:bun /app/node_modules ./node_modules
COPY --chown=bun:bun server/package.json server/tsconfig.json ./
COPY --chown=bun:bun server/migrations ./migrations
COPY --chown=bun:bun server/src ./src
USER bun
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" >/dev/null || exit 1
STOPSIGNAL SIGTERM
CMD ["bun", "run", "src/index.ts"]
