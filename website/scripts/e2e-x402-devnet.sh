#!/usr/bin/env bash
# Build + serve the website against a LOCAL DEVNET backend and run the real
# on-chain x402 registration Playwright e2e (e2e/x402-registration.spec.ts).
#
# This exercises the full browser path — standard x402 v2 challenge parsing plus
# server-side settlement (the facilitator broadcasts the SPL transfer) — against
# the solana-test-validator, so a real on-chain USDC transfer lands before the
# identity is created.
#
# PREREQS (bring these up first, from the umbrella repo):
#   - solana-test-validator on :8899, mongo on :27017, redis on :6379
#   - scripts/solana-facilitator.sh   (writes scripts/fixtures/facilitator.env,
#                                       funds the facilitator, creates ATAs)
#   - a real-rpc backend on :8083 wired to the validator with the local
#     facilitator settler. The umbrella `scripts/run-e2e-identity-register.sh`
#     stands up exactly this shape (adjust PORT to 8083); or run
#     `cmd/tinyplace-server` with:
#       TINYPLACE_VERIFIER=rpc SOLANA_RPC_URL=http://localhost:8899
#       BASE_RPC_URL=https://mainnet.base.org SOLANA_CONFIRMATIONS=1
#       TINYPLACE_FACILITATOR_BACKEND=local
#       TINYPLACE_TREASURY_ADDRESS / *_KEYPAIR + SOLANA_USDC_MINT from
#       scripts/fixtures/facilitator.env, plus a CORS origin for this port.
#
# Usage (from frontend/website):
#   scripts/e2e-x402-devnet.sh
#   E2E_API_URL=http://localhost:8083 PLAYWRIGHT_PORT=3100 scripts/e2e-x402-devnet.sh
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

E2E_API_URL="${E2E_API_URL:-http://localhost:8083}"
PLAYWRIGHT_PORT="${PLAYWRIGHT_PORT:-3100}"
SOLANA_RPC_URL="${NEXT_PUBLIC_SOLANA_RPC_URL:-http://localhost:8899}"
REDIS_CONTAINER="${E2E_REDIS_CONTAINER:-tinyplace-redis-1}"

echo "[i] backend (E2E_API_URL): $E2E_API_URL"
if ! curl -fsS -m3 "$E2E_API_URL/healthz" >/dev/null 2>&1; then
	echo "[x] backend not reachable at $E2E_API_URL/healthz — start the devnet stack first (see header)." >&2
	exit 1
fi

# NEXT_PUBLIC_* are inlined at build time, so build with the devnet endpoints.
echo "[i] building website -> $E2E_API_URL (devnet)"
NEXT_PUBLIC_API_BASE_URL="$E2E_API_URL" \
NEXT_PUBLIC_SOLANA_NETWORK="devnet" \
NEXT_PUBLIC_SOLANA_RPC_URL="$SOLANA_RPC_URL" \
TINYPLACE_BASIC_AUTH_ENABLED=false \
	npm run build

echo "[i] serving on :$PLAYWRIGHT_PORT and running the e2e (Playwright reuses it)"
# Playwright's webServer (playwright.config.ts) runs `next start -p $PLAYWRIGHT_PORT`
# and, locally, reuses an already-listening server. Let Playwright manage it.
E2E_X402=1 \
PLAYWRIGHT_PORT="$PLAYWRIGHT_PORT" \
E2E_API_URL="$E2E_API_URL" \
E2E_REDIS_CONTAINER="$REDIS_CONTAINER" \
TINYPLACE_BASIC_AUTH_ENABLED=false \
	npx playwright test e2e/x402-registration.spec.ts e2e/x402-bounty.spec.ts --project=chromium
