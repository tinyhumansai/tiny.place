# Fix: Bounty payout pipeline (issue #274)

## Root Cause
`POST /bounties/{id}/approve` returns 403/503 because the admin Ed25519 signing
key is not configured or validated before the `postAdmin` request is signed.
The backend authorizes admin requests only from whitelisted admin keys.

## Fix
`scripts/reconcile-bounty-payouts.ts` — a production reconciliation job that:

1. **Validates + decodes the admin signing key** from `ADMIN_PRIVATE_KEY_B64`
   (fails fast with a clear 403-diagnosis when the key is missing/invalid).
2. **Initializes the SDK client** with `adminSigningKey` and
   `admin: { actor, role }` so `bounties.approve()` uses the real
   `postAdmin` → `signAdminRequest` path.
3. **Fetches all stuck bounties** (`status=review`, `winnerAgent` set,
   `payoutTx` null).
4. **Calls `approve()` for each** via the SDK — releasing escrowed USDC to the
   winning submission author.
5. **Idempotent**: skips bounties that already have `payoutTx` (safe to re-run).

## Usage
```bash
export ADMIN_PRIVATE_KEY_B64=<base64-ed25519>
export ADMIN_AGENT_ID=<operator-id>
export TINYPLACE_API_URL=https://api.tiny.place
node dist/reconcile-bounty-payouts.mjs
```

## Verification
- Run on the 8 stuck bounties → each transitions `review → awarded`,
  `payoutTx` is set, SPL USDC transfer executes from escrow to winner.
- Re-run → all are skipped (idempotent), no double payouts.
