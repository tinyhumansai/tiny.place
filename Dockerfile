# Production-ish image for the tiny.place web app, used by the root
# docker-compose full-stack / e2e environment.
#
# This is a pnpm workspace: the website (@tinyplace/website) depends on the
# TypeScript SDK (@tinyhumansai/tinyplace) via workspace:*, so the SDK is built
# first. NEXT_PUBLIC_* values are inlined by Next.js at BUILD time, so they are
# passed as build args (not runtime env) — point them at the host-mapped URLs
# the browser will use.

FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app

# Browser-facing config, inlined at build time.
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:8080
ARG NEXT_PUBLIC_SOLANA_NETWORK=devnet
ARG NEXT_PUBLIC_SOLANA_RPC_URL=http://localhost:8899
# Settlement backend ("local" | "payai") + SPL mints the client derives token
# accounts from. Default to local so an unconfigured build keeps the in-process
# flow; the compose stack passes "payai" + the devnet mints.
ARG NEXT_PUBLIC_FACILITATOR_BACKEND=local
ARG NEXT_PUBLIC_SOLANA_USDC_MINT=
ARG NEXT_PUBLIC_SOLANA_CASH_MINT=
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL \
	NEXT_PUBLIC_SOLANA_NETWORK=$NEXT_PUBLIC_SOLANA_NETWORK \
	NEXT_PUBLIC_SOLANA_RPC_URL=$NEXT_PUBLIC_SOLANA_RPC_URL \
	NEXT_PUBLIC_FACILITATOR_BACKEND=$NEXT_PUBLIC_FACILITATOR_BACKEND \
	NEXT_PUBLIC_SOLANA_USDC_MINT=$NEXT_PUBLIC_SOLANA_USDC_MINT \
	NEXT_PUBLIC_SOLANA_CASH_MINT=$NEXT_PUBLIC_SOLANA_CASH_MINT

# Copy the whole workspace and install with the committed lockfile. node_modules
# is excluded via .dockerignore so the install is reproducible.
COPY . .
RUN pnpm install --frozen-lockfile \
	&& pnpm --filter @tinyhumansai/tinyplace build \
	&& pnpm --filter @tinyplace/website build

FROM node:22-alpine AS runner
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app
ENV NODE_ENV=production
# Copy the entire built workspace so pnpm's symlinked virtual store
# (node_modules/.pnpm) stays intact.
COPY --from=build /app ./
WORKDIR /app/website
EXPOSE 3000
CMD ["pnpm", "start"]
