# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Dev server:** `pnpm dev`
- **Build:** `pnpm build` (runs tsc then vite build)
- **Lint:** `pnpm lint` (zero warnings allowed; `pnpm lint:fix` to auto-fix)
- **Format:** `pnpm format`
- **Unit tests:** `pnpm test:unit` (vitest, jsdom environment)
- **Single unit test:** `pnpm vitest run src/path/to/file.test.ts`
- **E2E tests:** `pnpm test:e2e` (Playwright)
- **All tests:** `pnpm test` (unit + e2e)
- **Storybook:** `pnpm storybook`

## Architecture

Vite + React 19 + TypeScript SPA using TanStack Router for file-based routing.

**Routing:** TanStack Router with file-based route generation. Routes live in `src/routes/`; the route tree is auto-generated into `src/routeTree.gen.ts` by the Vite plugin — don't edit that file. Add new pages by creating route files in `src/routes/`.

**State & data:** Zustand for client state, TanStack Query for server state, React Hook Form + Zod for forms.

**Styling:** Tailwind CSS v4 via `@tailwindcss/vite` plugin. Global styles in `src/styles/tailwind.css`.

**i18n:** i18next with HTTP backend. Translation files in `src/assets/locales/{lang}/translations.json`. Locale files are copied to `dist/` at build time via `vite-plugin-static-copy`.

**Charts:** Nivo (`@nivo/bar`, `@nivo/line`, `@nivo/pie`).

**UI components:** Headless UI + Heroicons.

## Code Conventions

- Commits follow [Conventional Commits](https://www.conventionalcommits.org/) (enforced by commitlint).
- ESLint requires explicit return types on functions (`@typescript-eslint/explicit-function-return-type`).
- Use `type` imports for type-only imports (`@typescript-eslint/consistent-type-imports`).
- Array types must use generic syntax: `Array<T>` not `T[]` (`@typescript-eslint/array-type`).
- JSX props must be sorted: reserved first, shorthand first, callbacks last (`react/jsx-sort-props`).
- Avoid abbreviations (unicorn/prevent-abbreviations) — exceptions: `db`, `arg`, `args`, `env`, `fn`, `prop`, `props`, `ref`, `refs`.
- `FunctionComponent` return type is defined in `src/common/types.ts` as `React.ReactElement | null`.
