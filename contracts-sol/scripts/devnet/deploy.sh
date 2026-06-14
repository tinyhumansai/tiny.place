#!/usr/bin/env bash
# Build the four programs from source and deploy (or upgrade) them on devnet.
#
#   scripts/devnet/deploy.sh            # build + deploy all
#   SKIP_BUILD=1 scripts/devnet/deploy.sh   # reuse existing target/deploy/*.so
#
# Re-running upgrades in place (same program ids, the deployer stays upgrade
# authority). Costs ~7 SOL of recoverable rent on the first deploy of all four.
set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
load_env

echo "==> deployer  : $DEPLOYER_PUBKEY"
echo "==> rpc       : $DEVNET_RPC_URL"
echo "==> balance   : $(sol_balance) SOL"
echo

if [ "${SKIP_BUILD:-0}" != "1" ]; then
  echo "==> anchor build (from source)"
  ( cd "$CONTRACTS_DIR" && anchor build )
else
  echo "==> SKIP_BUILD=1 -> reusing target/deploy/*.so"
fi
echo

for entry in "${PROGRAMS[@]}"; do
  name="${entry%%:*}"; keypair="${entry##*:}"
  so="$CONTRACTS_DIR/target/deploy/$name.so"
  pid="$(program_id "$keypair")"
  [ -f "$so" ] || die "missing artifact $so (run without SKIP_BUILD)"

  if info="$(solana program show "$pid" --url "$DEVNET_RPC_URL" 2>/dev/null)"; then
    echo "==> upgrading $name ($pid)"
    # An upgrade fails if the new binary is larger than the programdata the
    # account was allocated for (we deployed at 1x with no headroom). Grow it
    # first by the size delta so the upgrade fits.
    deployed_len="$(printf '%s\n' "$info" | awk -F': *' '/Data Length/{gsub(/[^0-9].*/,"",$2); print $2; exit}')"
    new_len="$(wc -c < "$so" | tr -d ' ')"
    if [ -n "$deployed_len" ] && [ "$new_len" -gt "$deployed_len" ]; then
      delta=$((new_len - deployed_len))
      echo "    new binary is $delta bytes larger; extending programdata"
      solana program extend "$pid" "$delta" \
        --keypair "$DEPLOYER_KEYPAIR" --url "$DEVNET_RPC_URL"
    fi
  else
    echo "==> deploying $name ($pid) [$(wc -c < "$so") bytes]"
  fi

  # Public devnet RPC throttles large program writes; priority fee + generous
  # sign attempts make the chunked writes land under congestion.
  solana program deploy "$so" \
    --program-id "$keypair" \
    --keypair "$DEPLOYER_KEYPAIR" \
    --upgrade-authority "$DEPLOYER_KEYPAIR" \
    --url "$DEVNET_RPC_URL" \
    --use-rpc \
    --with-compute-unit-price "${PRIORITY_FEE:-100000}" \
    --max-sign-attempts "${MAX_SIGN_ATTEMPTS:-1000}"
  echo "    done. balance: $(sol_balance) SOL"
  echo
done

echo "==> all programs deployed."
echo
# Confirm each deploy landed and the on-chain bytecode matches what we built.
# Set VERIFY=0 to skip.
if [ "${VERIFY:-1}" != "0" ]; then
  verify_all
fi
