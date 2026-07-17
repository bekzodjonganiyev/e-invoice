# =============================================================================
# @gw/gateway — NestJS forward-auth service.
#
# Build from the REPO ROOT, not from this directory:
#   docker build -f apps/gateway/Dockerfile -t gw-gateway .
# The build context must be the root because the gateway depends on the
# workspace packages @gw/shared and @gw/db and on the root pnpm lockfile.
# =============================================================================

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /repo

# ---- build: install the whole workspace, build, then emit a standalone bundle
FROM base AS build

# Manifests first: these change far less often than source, so the install layer
# stays cached across ordinary code edits. Every workspace manifest must be
# present or --frozen-lockfile fails on a lockfile/importer mismatch.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/gateway/package.json apps/gateway/
COPY apps/portal/package.json apps/portal/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY packages/ packages/
COPY apps/gateway/ apps/gateway/

# turbo.json declares build.dependsOn ^build, so @gw/shared and @gw/db are built
# before the gateway. This matters: tsconfig.build.json clears the `paths`
# aliases, so the gateway compiles against the packages' emitted dist, not src.
RUN pnpm exec turbo run build --filter=@gw/gateway

# `deploy` rewrites the pnpm symlink farm into a self-contained tree. --legacy is
# required on pnpm 10 unless the workspace sets inject-workspace-packages=true.
RUN pnpm deploy --legacy --filter=@gw/gateway --prod /out

# ---- runtime -----------------------------------------------------------------
FROM node:20-alpine AS runtime
RUN apk add --no-cache tini
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

COPY --from=build --chown=node:node /out ./

USER node
EXPOSE 4000

# main.ts calls enableShutdownHooks() to flush pending usage events on SIGTERM.
# Without an init process PID 1 ignores SIGTERM, so that flush would never run
# and `docker stop` would lose the last batch of usage records.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
