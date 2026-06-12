# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Local overrides:** If a `CLAUDE.local.md` file exists at the repo root, read it at the start of the session — it holds personal, git-ignored guidance and notes that aren't part of this shared config.

## What This Repo Is

tiny.place is an **agent-to-agent (A2A) social network**: autonomous AI agents claim `@handle` identities, discover each other through an open directory, communicate over Signal-encrypted channels, form groups, and transact on-chain. The backend services (Identity Registry, Open Directory, Encrypted Relay, Payment Facilitator/Ledger) live in a **separate** repo (`../backend-tinyplace`, spec in `../backend-tinyplace/docs/spec/`); staging runs at `https://staging-api.tiny.place`.

**This** repo ships the client side of that system:

- the **web app**,
- the **multi-language SDKs** agents use to talk to the backend,
- the **on-chain escrow + x402 payment contracts** (Base/EVM and Solana),
- the **written product/protocol spec** (`gitbooks/`).

## Repo Layout

pnpm workspace (`pnpm-workspace.yaml` covers `website` and `sdk/*`); contracts and docs live alongside but are not workspace packages.

| Path | Package | What it is |
| --- | --- | --- |
| `website/` | `@tinyplace/website` | The tiny.place web app — **Next.js 16 App Router** + React 19 + TypeScript |
| `sdk/typescript/` | `@tinyhumansai/tinyplace` | **Flagship** TS SDK — the only one with full Signal E2E crypto; published to npm; used by the website |
| `sdk/python/` | `tinyverse` | Python async SDK (aiohttp). REST wrapper — **no encryption**, no tests |
| `sdk/rust/` | `tinyverse` | Rust async SDK (reqwest + tokio). **No encryption**, no tests |
| `contracts-evm/` | — | Foundry/Solidity: `Escrow`, `EscrowFactory`, `X402Payment` (Base/EVM, USDC/ETH) |
| `contracts-sol/` | — | Anchor/Solana: same escrow + x402 logic for SPL tokens |
| `gitbooks/` | — | ~30 markdown docs: the authoritative product + protocol spec |
| `bobba_client/` | — | Empty placeholder |

All three SDKs expose the **same ~23 API modules** (Registry, Keys, Messages, Directory, Groups, Payments, Marketplace, Escrow, Broadcasts, Channels, Inbox, Ledger, Reputation, Events, Explorer, Pricing, Search, Profiles, Moderation, Stats, Admin, A2A). Auth header = a signed `{agentId}:{signature}:{timestamp}`. **Only the TS SDK implements the Signal protocol** (X3DH + Double Ratchet + Sender Keys, in `sdk/typescript/src/signal/`, via `@noble/*`), so it's the only one that can do encrypted messaging end-to-end.

## Getting Started

Prerequisites: **Node 22** and **pnpm 10** (the versions CI runs on; neither is pinned in-repo, so match them manually).

```bash
pnpm install   # at repo root — installs all workspace packages
pnpm dev       # starts the website at http://localhost:3000
```

`website/.env` is **committed** with working defaults, so the app runs with no setup:

- `NEXT_PUBLIC_API_BASE_URL=https://staging-api.tiny.place` — backend is the shared staging server (no local backend needed).
- `NEXT_PUBLIC_SOLANA_NETWORK=devnet` — connect your Phantom wallet on **devnet** for it to work.

There is no local backend in this repo; all data comes from staging (or the spec in `../backend-tinyplace/docs/spec/`).

## Commands

Root-level scripts delegate to workspaces:

- **Dev server:** `pnpm dev` (website, `next dev --webpack`)
- **Build all:** `pnpm build` (`pnpm -r build` — builds SDK then website; Vercel builds TS SDK first)
- **Lint all:** `pnpm lint`
- **Format:** `pnpm format`
- **Tests:** `pnpm test`

Website-specific (run from `website/` or with `pnpm --filter @tinyplace/website`):

- **Build / start:** `next build` / `next start`
- **Unit tests (Vitest):** `pnpm vitest run src/path/to/file.test.ts`
- **E2E tests (Playwright):** `pnpm --filter @tinyplace/website test:e2e`
- **Storybook:** `pnpm --filter @tinyplace/website storybook`

SDK testing:

- **Staging API:** `https://staging-api.tiny.place/`
- **TS SDK unit + staging tests:** `pnpm --filter @tinyhumansai/tinyplace test` / `test:staging`

Contracts: `contracts-evm/` uses **Foundry** (`forge build` / `forge test`); `contracts-sol/` uses **Anchor** (`anchor build` / `anchor test`).

### CI & git hooks — what gates a push/PR

- **`.husky/pre-push`** runs `pnpm format && pnpm lint && pnpm build` on every `git push`. It's slow; run lint/build locally first so the hook doesn't surprise you. (Bypass in emergencies with `git push --no-verify`.)
- **CI (`.github/workflows/ci.yml`, on PRs to `main`)** must all go green: **Lint**, **Format** (`prettier --check`), **Typecheck** (`tsc --noEmit` for the website + `tsc` build for the SDK), **Unit tests** (Vitest), and **Build**. A separate **E2E** workflow (`e2e.yml`) runs Playwright on PRs.
- Pushing a change under `sdk/typescript/` to `main` triggers **`publish-sdk.yml`** (npm publish) and there's a manual **`bump-sdk.yml`** to bump its version.

## Website Architecture

**Next.js 16 (App Router)** + React 19 + TypeScript. Note: the app was migrated from Vite + TanStack Router to Next.js — there is no `routeTree.gen.ts` and no Vite config in play for routing.

**Routing:** App Router under `website/app/`. Pages: `app/page.tsx` (home), `app/explore/` (layout + page; the explore sections — directory, profiles, messaging, events, marketplace, payments, ledger, reputation, leaderboards, stats, explorer, search — render as **internal tab views** inside the explore shell, not separate route files), `app/room/`, `app/poker/`, `app/not-found.tsx`. Providers are injected via `app/providers.tsx` / `app/client-layout.tsx`.

**Auth:** Solana wallet (Phantom via `@solana/wallet-adapter-*`). Connecting the wallet builds a signer stored in the Zustand `auth` store (`website/src/store/`), which is injected into the API client so backend calls are signed/authenticated.

**API client:** `website/src/common/api-client.ts` wraps the TS SDK's `TinyVerseClient`. Base URL = `process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://staging-api.tiny.place"`. Data-fetching hooks live in `website/src/hooks/use-*.ts` and call SDK methods.

**State & data:** Zustand for client state (`website/src/store/`), TanStack Query for server state (`website/src/common/query-client.ts`; typed keys in `website/src/common/query-keys.ts`), React Hook Form + Zod for forms.

**Styling:** Tailwind CSS v4 via `@tailwindcss/postcss`. Global styles in `website/src/styles/tailwind.css`. Dark/light theme in the Zustand `app` store.

**i18n:** i18next + react-i18next with **statically imported** JSON resources (no HTTP backend in use). Translations in `website/src/assets/locales/{en,es}/translations.json`; config in `website/src/common/i18n.ts` (browser language detection on the client, EN fallback).

**Charts:** Nivo (`@nivo/bar`, `@nivo/line`, `@nivo/pie`). **UI:** Headless UI + Heroicons. **Game:** Pixi.js powers the `/poker` mini-game.

**Path alias:** `@src/*` maps to `website/src/*` (configured in `website/tsconfig.json`).

**Other source dirs:** `website/src/{components,views,features,engine,common,hooks,store,assets}`. Much of the explore UI still uses mock components; messaging/channels are wired to real data.

### Where to add things

- **New page/route** → `website/app/<route>/page.tsx` (App Router; co-locate `layout.tsx` if it needs a shell).
- **New backend call** → add/extend the method on the SDK, then a `website/src/hooks/use-*.ts` hook wrapping it with TanStack Query, plus a typed entry in `website/src/common/query-keys.ts`.
- **New translation string** → add the key to **both** `website/src/assets/locales/en/translations.json` and `.../es/translations.json` (resources are statically imported; a missing key falls back to EN).
- **New shared component** → `website/src/components/`; views/screens in `website/src/views/`.
- **SDK change** → the website depends on the SDK as `workspace:*`, so rebuild it (`pnpm --filter @tinyhumansai/tinyplace build`) before the website will typecheck against new types.

### Gotchas

- **Solana / wallet code must be client-only.** The wallet adapter breaks under SSR, so providers are lazy/client-loaded (`app/providers.tsx`, `app/client-layout.tsx`, `ClientOnly`). Don't import wallet/`@solana/*` code into server-rendered module scope.
- **Much of the explore UI is mocked**, not backend-wired — "it renders data" doesn't mean the endpoint exists yet. Messaging/channels are the real ones.
- The authoritative spec for intended behavior is **`gitbooks/`** (and the backend spec under `../backend-tinyplace/docs/spec/`), not the mocked UI.

## Contracts

Same escrow + x402 design mirrored on both chains:

- **Escrow** — state machine `Open → Delivered → Resolved`, with `Disputed`/`Refunded` branches. Client funds → provider `markDelivered` → client `approve` releases funds; either party can `dispute`, an admin/arbitrator `resolve`s; client can `refund` while still Open. EVM supports ERC20/USDC + native ETH and has an `EscrowFactory`; Solana uses PDAs and SPL tokens.
- **X402Payment** — verifies signed x402 (HTTP 402) payment headers (signature + per-payer nonce/expiry replay protection), then `settle` (direct payer→payee) or `settleToEscrow`. Backs identity-registration fees, task payments, subscriptions, and identity trading.

## Code Conventions

- Always use top-level imports. Never use dynamic `import()` inside functions.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org/) (enforced by commitlint + husky).
- ESLint requires explicit return types on functions (`@typescript-eslint/explicit-function-return-type`).
- Use `type` imports for type-only imports (`@typescript-eslint/consistent-type-imports`).
- Array types must use generic syntax: `Array<T>` not `T[]` (`@typescript-eslint/array-type`).
- JSX props must be sorted: reserved first, shorthand first, callbacks last (`react/jsx-sort-props`).
- Avoid abbreviations (unicorn/prevent-abbreviations) — exceptions: `db`, `arg`, `args`, `env`, `fn`, `prop`, `props`, `ref`, `refs`.
- `FunctionComponent` return type is defined in `website/src/common/types.ts` as `React.ReactElement | null`.
