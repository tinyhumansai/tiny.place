/**
 * Thin Solana JSON-RPC helpers — just enough for the agent to inspect its own
 * balance and (on a local validator) fund itself with an airdrop. Uses raw
 * fetch so the package carries no @solana/web3.js dependency, mirroring the
 * SDK's dependency-free approach.
 */
import type { AgentConfig } from "./config.js";

const LAMPORTS_PER_SOL = 1_000_000_000;

async function rpc<T>(
  url: string,
  method: string,
  params: Array<unknown>,
): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = (await response.json()) as {
    result?: T;
    error?: { message: string };
  };
  if (json.error) {
    throw new Error(`solana rpc ${method} failed: ${json.error.message}`);
  }
  return json.result as T;
}

export interface BalanceSummary {
  address: string;
  sol: number;
  lamports: number;
  usdc: number | null;
}

export async function getBalances(
  config: AgentConfig,
  address: string,
): Promise<BalanceSummary> {
  const balance = await rpc<{ value: number }>(
    config.solanaRpcUrl,
    "getBalance",
    [address],
  );
  let usdc: number | null = null;
  try {
    const accounts = await rpc<{
      value: Array<{
        account: {
          data: { parsed: { info: { tokenAmount: { uiAmount: number } } } };
        };
      }>;
    }>(config.solanaRpcUrl, "getTokenAccountsByOwner", [
      address,
      { mint: config.usdcMint },
      { encoding: "jsonParsed" },
    ]);
    usdc = accounts.value.reduce(
      (sum, entry) =>
        sum + (entry.account.data.parsed.info.tokenAmount.uiAmount ?? 0),
      0,
    );
  } catch {
    // No USDC token account (or mint absent on a fresh validator) — leave null.
  }
  return {
    address,
    lamports: balance.value,
    sol: balance.value / LAMPORTS_PER_SOL,
    usdc,
  };
}

/** Requests an airdrop on a local validator and waits for confirmation. */
export async function airdrop(
  config: AgentConfig,
  address: string,
  sol: number,
): Promise<string> {
  if (!config.isLocal) {
    throw new Error(
      "airdrop is only available against a local validator (set TINYPLACE_SOLANA_RPC_URL to http://localhost:8899)",
    );
  }
  const lamports = Math.round(sol * LAMPORTS_PER_SOL);
  const signature = await rpc<string>(config.solanaRpcUrl, "requestAirdrop", [
    address,
    lamports,
  ]);
  // Poll for confirmation (best effort — validator is fast locally).
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const statuses = await rpc<{
      value: Array<{ confirmationStatus?: string } | null>;
    }>(config.solanaRpcUrl, "getSignatureStatuses", [[signature]]);
    const status = statuses.value[0]?.confirmationStatus;
    if (status === "confirmed" || status === "finalized") break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return signature;
}
