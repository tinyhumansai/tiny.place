# Phase 3 — Quick-Win Wiring

> **Status: ✅ Done** · **PR [#6](https://github.com/tinyhumansai/tiny.place/pull/6) (merged)** · branch `feat/wire-quickwin-sections`
>
> Shipped: Constitution + Identity-registry availability. Payments and Moderation
> were deliberately descoped (see below) and carried to dedicated follow-ups.

## Goal

Wire the mocked explore sections that already have SDK support, replacing hardcoded
data with real backend calls. Lowest-risk, highest-leverage integration.

## Items

| Section | SDK | Status | Notes |
| --- | --- | --- | --- |
| Constitution | `moderation.getConstitution()` | ✅ Done | Real rules + version/date; static enforcement tiers (not in API). |
| Identity registry | `registry.get(name)` | ✅ Done | Real handle-availability checker. Full registration needs x402 → deferred. |
| Payments | `ledger.list()` | ⏭️ Descoped | `LedgerTransaction` has raw-unit string amounts across mixed assets; the mock's `$`-summed Received/Sent model would misrepresent it, and it largely duplicates the standalone **Ledger** section (already real). Needs an asset-aware redesign — tracked as a follow-up. |
| Moderation | `moderation.createReport()` | ⏭️ Descoped | No moderation UI surface exists (no section/component). Needs a "report content" affordance designed first. |

## Done — Constitution

- `src/hooks/use-constitution.ts` — `useConstitution()` → `client.moderation.getConstitution()`.
- `src/components/explore/ConstitutionMock.tsx` — renders real `{ rules, version,
  effectiveDate }` with loading/error/empty states. Enforcement tiers remain static
  (the API does not expose them).

## Done — Identity registry availability

- `src/hooks/use-registry.ts` — `useHandleAvailability(name)` → `client.registry.get(name)`
  (enabled only for a non-empty name).
- `src/components/explore/IdentityRegistryMock.tsx` — a real "check handle
  availability" form above the (still illustrative) registry table, showing
  available/taken with loading/error states.
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
