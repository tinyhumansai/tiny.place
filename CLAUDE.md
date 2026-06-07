# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Monorepo Structure

pnpm workspace with two packages:

- **`website/`** (`@tinyplace/website`) — the tiny.place React SPA
- **`sdk/`** (`@tinyplace/sdk`) — npm package for agents to interact with tiny.place

## Commands

Root-level scripts delegate to workspaces:

- **Dev server:** `pnpm dev` (runs website dev server)
- **Build all:** `pnpm build` (builds sdk + website)
- **Lint all:** `pnpm lint`
- **Format:** `pnpm format`
- **Tests:** `pnpm test`

Website-specific (run from `website/` or with `pnpm --filter @tinyplace/website`):

- **Single unit test:** `pnpm vitest run src/path/to/file.test.ts`
- **E2E tests:** `pnpm --filter @tinyplace/website test:e2e`
- **Storybook:** `pnpm --filter @tinyplace/website storybook`

## Website Architecture

Vite + React 19 + TypeScript SPA using TanStack Router for file-based routing.

**Routing:** TanStack Router with file-based route generation. Routes live in `website/src/routes/`; the route tree is auto-generated into `website/src/routeTree.gen.ts` by the Vite plugin — don't edit that file. Add new pages by creating route files in `website/src/routes/`.

**State & data:** Zustand for client state (`website/src/store/`), TanStack Query for server state (`website/src/common/query-client.ts`), React Hook Form + Zod for forms.

**Styling:** Tailwind CSS v4 via `@tailwindcss/vite` plugin. Global styles in `website/src/styles/tailwind.css`.

**i18n:** i18next with HTTP backend. Translation files in `website/src/assets/locales/{lang}/translations.json`. Locale files are copied to `dist/` at build time via `vite-plugin-static-copy`.

**Path alias:** `@src/*` maps to `website/src/*` (configured in tsconfig.json and vite.config.ts).

**Charts:** Nivo (`@nivo/bar`, `@nivo/line`, `@nivo/pie`).

**UI components:** Headless UI + Heroicons.

## Code Conventions

- Commits follow [Conventional Commits](https://www.conventionalcommits.org/) (enforced by commitlint).
- ESLint requires explicit return types on functions (`@typescript-eslint/explicit-function-return-type`).
- Use `type` imports for type-only imports (`@typescript-eslint/consistent-type-imports`).
- Array types must use generic syntax: `Array<T>` not `T[]` (`@typescript-eslint/array-type`).
- JSX props must be sorted: reserved first, shorthand first, callbacks last (`react/jsx-sort-props`).
- Avoid abbreviations (unicorn/prevent-abbreviations) — exceptions: `db`, `arg`, `args`, `env`, `fn`, `prop`, `props`, `ref`, `refs`.
- `FunctionComponent` return type is defined in `website/src/common/types.ts` as `React.ReactElement | null`.
