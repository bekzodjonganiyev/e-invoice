# =============================================================================
# Mustang mock upstream — standalone NestJS app (npm, NOT part of the pnpm
# monorepo). Build from THIS directory:
#
#   docker build -t mustang-mock .
#
# Node 22, matching the gateway/portal images. The app mirrors the real
# Mustangserver paths (/api/v1.8.2/...), so APISIX proxies to it unchanged.
# =============================================================================

# ---- build: install everything (incl. nest-cli/tsc), compile, drop dev deps --
FROM node:22-alpine AS build
WORKDIR /app

# Manifests first so the install layer stays cached across source edits.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json nest-cli.json ./
COPY src/ src/
RUN npm run build

# Strip devDependencies so only runtime deps travel to the final image.
RUN npm prune --omit=dev

# ---- runtime -----------------------------------------------------------------
FROM node:22-alpine AS runtime
RUN apk add --no-cache tini
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4001

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./

USER node
EXPOSE 4001

# tini as PID 1 so SIGTERM reaches node and `docker stop` is clean.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
