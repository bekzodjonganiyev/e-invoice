# =============================================================================
# @gw/portal — Next.js 15 dashboard.
#
# Build from the REPO ROOT, not from this directory:
#   docker build -f apps/portal/Dockerfile \
#     --build-arg NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co \
#     --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_xxx \
#     -t gw-portal .
#
# The two NEXT_PUBLIC_* build args are REQUIRED and are not merely a
# convenience: Next inlines them into the client bundle at build time, so
# supplying them only at runtime leaves the browser code with `undefined` and
# env.public.ts throws. They are public values (anon key, RLS enforced), so
# baking them into the image is safe — but it also means this image is bound to
# one Supabase project. Pointing at a different project means a rebuild.
# =============================================================================

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /repo

# ---- build -------------------------------------------------------------------
FROM base AS build

# Manifests first so the install layer survives ordinary source edits. Every
# workspace manifest must be present or --frozen-lockfile fails on a
# lockfile/importer mismatch.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/portal/package.json apps/portal/
COPY apps/gateway/package.json apps/gateway/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY packages/ packages/
COPY apps/portal/ apps/portal/

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}

# Fail here rather than shipping an image whose client bundle carries
# `undefined` and only breaks in the browser.
RUN test -n "$NEXT_PUBLIC_SUPABASE_URL" || (echo "ERROR: --build-arg NEXT_PUBLIC_SUPABASE_URL is required" && false)
RUN test -n "$NEXT_PUBLIC_SUPABASE_ANON_KEY" || (echo "ERROR: --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY is required" && false)

# turbo.json declares build.dependsOn ^build, so @gw/shared and @gw/db are built
# first — next.config transpiles them, but resolves them via their dist entry.
RUN pnpm exec turbo run build --filter=@gw/portal

# ---- runtime -----------------------------------------------------------------
FROM node:22-alpine AS runtime
RUN apk add --no-cache tini
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
# Next's standalone server binds to localhost unless told otherwise, which would
# make the container unreachable from outside its own network namespace.
ENV HOSTNAME=0.0.0.0

# `output: 'standalone'` with outputFileTracingRoot at the monorepo root emits
# this tree, so server.js sits at apps/portal/server.js — not at the root.
COPY --from=build --chown=node:node /repo/apps/portal/.next/standalone ./
# Static assets are deliberately excluded from the standalone bundle; without
# this copy the app serves HTML but every /_next/static asset 404s.
COPY --from=build --chown=node:node /repo/apps/portal/.next/static ./apps/portal/.next/static

# No public/ directory exists in this app — nothing to copy. Add a COPY here if
# one is ever introduced.

USER node
EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/portal/server.js"]
