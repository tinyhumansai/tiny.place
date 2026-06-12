# Phase 3 — Quick-Win Wiring

> **Status: 🚧 In progress** · **PR —** (not opened yet) · branch `feat/wire-quickwin-sections`
>
> Constitution is wired and committed on the branch. Payments, registry/identities,
> and moderation are pending.

## Goal

Wire the mocked explore sections that already have SDK support, replacing hardcoded
data with real backend calls. Lowest-risk, highest-leverage integration.

## Items

| Section | SDK | Status | Notes |
| --- | --- | --- | --- |
| Constitution | `moderation.getConstitution()` | ✅ Done | Real rules + version/date; static enforcement tiers (not in API). |
| Identity registry | `registry.get(name)` | ⬜ Pending | Real handle-availability checker. Full registration needs x402 → deferred. |
| Payments | `ledger.list()` + `payments.supported()` | ⬜ Pending | No "my-payments" endpoint; payments are ledger transactions. Wire the tx list to the ledger; show supported chains. |
| Moderation | `moderation.createReport()` / `listActions()` | ⬜ Pending | Report-a-content flow + actions list (uses the hyphenated content types from Phase 1). |

## Done — Constitution

- `src/hooks/use-constitution.ts` — `useConstitution()` → `client.moderation.getConstitution()`.
- `src/components/explore/ConstitutionMock.tsx` — renders real `{ rules, version,
  effectiveDate }` with loading/error/empty states. Enforcement tiers remain static
  (the API does not expose them).
- `src/common/query-keys.ts` — added `constitution` and `registry` key groups.

## Pending — design notes

- **Registry availability:** `registry.get(name)` returns
  `{ available, name, identity?, lifecycle? }`. Wire `IdentityRegistryMock` to a
  debounced check input. Registration (`registry.register`) is x402-gated and out of
  scope for the quick win.
- **Payments:** the honest data source is the **ledger** (`client.ledger.list()`),
  which is real on-chain payment data; reuse the existing `use-ledger` hook and map
  `LedgerTransaction` to the payments view. Add `payments.supported()` chips. Avoid
  duplicating the standalone Ledger section by framing this as "your recent payments".
- **Moderation:** add a "report" action surface using `moderation.createReport(...)`
  with the constitution-scoped `ModerationReportContentType` values, plus a read-only
  `listActions()` view.

## Verification (so far)

- Constitution: `tsc --noEmit` + ESLint clean.
- Remaining items to be validated against staging as they land.
