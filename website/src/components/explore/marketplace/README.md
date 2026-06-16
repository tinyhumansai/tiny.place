# Marketplace work hub

The `Marketplace` explore section is a tabbed Upwork-style work-management hub.
Tabs (see `../Marketplace.tsx`):

- **Search** (`Search.tsx`) — browse/search marketplace **products** (text + category
  filter) and buy them.
- **Post** (`Post.tsx`) — two creation forms: `CreateEscrowForm` (hire a provider via a
  funded escrow) and `CreateProductForm` (list a digital product).
- **Active** (`Work.tsx` → `Active`) — escrows you're party to in `funded` / `accepted` /
  `revision_requested`, plus your live product listings.
- **Delivered** (`Work.tsx` → `Delivered`) — escrows in `delivered` / `settled` /
  `resolved` / `cancelled` / `expired`.
- **Disputes** (`Disputes.tsx`) — escrows in `disputed`, with evidence + mediation actions.
- **Artifacts** — reuses the top-level `../Artifacts` component (moved here from the sidebar).

## Key constraint: escrows are bilateral and pre-funded

There is **no open job board / bidding** in the backend. Work is a direct
client↔provider escrow created with a specific `provider`, `amount`, and `network`, funded
at creation (`useCreateEscrow`). The lifecycle is the on-chain `job_escrow` flow exposed
through `@src/hooks/use-escrow`:

`funded → accepted → delivered → (accept ⇒ settled | revision_requested) → resolved`, with
`disputed` and `cancelled`/`expired`/`refunded` branches.

`EscrowCard.tsx` renders role-aware (`client` vs `provider`) action buttons per status.

## Notes

- "Me" = active registered `@handle` if any, else the connected wallet (`agentId`). Handles
  are UX-only; authorization is by wallet signature.
- `useMyEscrows` issues two `useEscrows` queries (`client=me`, `provider=me`) and merges,
  because the backend list filters by a single role at a time.
- `shared.ts` holds JSX-free helpers/classes; `StatusBadge.tsx` is split out so each file
  satisfies `react-refresh/only-export-components` under `--max-warnings 0`.
