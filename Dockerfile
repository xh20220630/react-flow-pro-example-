# syntax=docker/dockerfile:1

FROM node:24.13.0-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    npm_config_store_dir=/pnpm/store
RUN corepack enable && corepack prepare pnpm@10.20.0 --activate

FROM base AS manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/react-flow-pro/package.json ./packages/react-flow-pro/package.json

FROM manifests AS dependencies
RUN --mount=type=cache,id=react-flow-pro-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store

FROM dependencies AS builder
COPY . .
RUN mkdir -p public && pnpm build && rm -rf .next/cache

FROM manifests AS production-dependencies
RUN --mount=type=cache,id=react-flow-pro-pnpm,target=/pnpm/store \
    pnpm install --prod --frozen-lockfile --store-dir /pnpm/store

# 协作 WebSocket 依赖自定义服务器，不能替换为 Next.js standalone 的 server.js。
FROM node:24.13.0-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOST=0.0.0.0 \
    PORT=3000

COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=production-dependencies --chown=node:node /app/packages ./packages
COPY --from=builder --chown=node:node /app/packages/react-flow-pro/src ./packages/react-flow-pro/src
COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/src/server ./src/server
COPY --from=builder --chown=node:node /app/package.json /app/next.config.ts ./

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node --input-type=module -e "const response = await fetch('http://127.0.0.1:' + process.env.PORT + '/api/health', { signal: AbortSignal.timeout(4000) }); if (!response.ok) process.exit(1);"
CMD ["node", "src/server/index.ts"]
