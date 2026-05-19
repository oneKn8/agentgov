# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    AGENTGOV_DB=/data/agentgov.db
WORKDIR /app

RUN groupadd --system agentgov \
  && useradd --system --gid agentgov --home-dir /app agentgov \
  && mkdir -p /data \
  && chown -R agentgov:agentgov /app /data

COPY --from=build --chown=agentgov:agentgov /app/package.json /app/package-lock.json ./
COPY --from=build --chown=agentgov:agentgov /app/node_modules ./node_modules
COPY --from=build --chown=agentgov:agentgov /app/dist ./dist
COPY --chown=agentgov:agentgov fixtures ./fixtures
COPY --chown=agentgov:agentgov policies ./policies
COPY --chown=agentgov:agentgov schemas ./schemas
COPY --chown=agentgov:agentgov target-agents ./target-agents
COPY --chown=agentgov:agentgov trust-registry.json ./trust-registry.json

USER agentgov
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/healthz').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/server.js"]
