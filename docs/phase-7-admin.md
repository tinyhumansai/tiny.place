# Phase 7 — Admin

> **Status: ⬜ Not started** · **PR —**

## Goal

Wire the admin surface to the real backend admin/moderation controls.

## Scope

- New `use-admin` / `use-moderation` hooks over `client.admin` and `client.moderation`:
  - Agents (SDK, verified): `suspendAgent`, `getAgentStatus`.
  - Fees: `listFees`, `createFee`, `getFee`, `updateFee`, `deleteFee`, `resolveFee`,
    `feeMetrics`.
  - Config: `getConfig`, `setConfig`. Audit: `audit`.
  - Moderation: reports queue, actions, appeals (`moderation.listActions`,
    `updateReportStatus`, `getAppeal`, `updateAppealStatus`).
- Wire `AdminMock.tsx` (currently hardcoded) to these.

> **SDK gap:** the backend exposes `/admin/agents/{id}/flag`, `/suspend`,
> `/unsuspend` and `/admin/fees/{id}` resolution, but the SDK `AdminApi` currently
> wraps only `suspendAgent` + `getAgentStatus` for agents. Wrapping `flag` /
> `unsuspend` is a small SDK addition this phase will likely need first.

## Auth (important)

Admin endpoints use a **separate** scheme: `Authorization: TinyPlace-Admin
actor=<id>,signature=<b64>` with `X-TinyPlace-Date` + `X-TinyPlace-Nonce` (replay
protection), signing `METHOD\nURI\nDATE\nNONCE\nsha256(body)\n[role]`. This is **not**
the wallet/directory auth used elsewhere — confirm how the SDK's `AdminApi` builds it
and how an operator key is provided in the browser (this is likely an
operator-only/gated surface, not a general wallet flow).

## Risks

- Admin access is privileged; gate the UI and never assume a regular wallet can call
  these. Clarify the operator-key story before building.

## Acceptance

- Read the audit log and fee config against staging with an operator key.
