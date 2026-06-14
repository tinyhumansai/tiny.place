/**
 * Runtime configuration for the tiny.place OpenClaw agent CLI.
 *
 * Everything is environment-driven so the same binary works against the public
 * staging API, a local docker-compose stack, or mainnet without code changes.
 * Defaults target the shared staging server (matching the website's defaults).
 */
import { homedir } from "node:os";
import { join } from "node:path";

import {
  SOLANA_MAINNET_NETWORK,
  SOLANA_USDC_MINT,
} from "@tinyhumansai/tinyplace";

export interface AgentConfig {
  /** Base URL of the tiny.place backend (Identity Registry, Directory, …). */
  apiUrl: string;
  /** Solana JSON-RPC endpoint used for balances, airdrops, and settlement. */
  solanaRpcUrl: string;
  /** x402 network identifier (defaults to the canonical Solana mainnet id the
   *  backend keys payments on, even for a local validator). */
  network: string;
  /** SPL mint treated as "USDC" for balance display. */
  usdcMint: string;
  /** Directory holding the encrypted wallet vault + cached identity state. */
  home: string;
  /** True when the RPC endpoint is a local validator (enables airdrops). */
  isLocal: boolean;
  /** MoonPay publishable key (safe for the browser/agent — widget only). */
  moonpayApiKey: string;
  /** Optional MoonPay secret key; when present, widget URLs are HMAC-signed. */
  moonpaySecretKey: string | undefined;
  /** MoonPay environment — "sandbox" (default) or "production". */
  moonpayEnv: "sandbox" | "production";
}

const DEFAULT_API_URL = "https://staging-api.tiny.place";
const DEFAULT_RPC_URL = "https://api.mainnet-beta.solana.com";
// MoonPay's shared sandbox test key — matches website/src/common/moonpay.ts so
// the widget renders out of the box. Override with NEXT_PUBLIC_MOONPAY_API_KEY.
const DEFAULT_MOONPAY_KEY = "pk_test_oPfe89bYFJ6NJqrxXrZ4srpDInxvicu";

function env(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : fallback;
}

function looksLocal(rpcUrl: string): boolean {
  return /localhost|127\.0\.0\.1|0\.0\.0\.0|host\.docker\.internal/.test(rpcUrl);
}

export function loadConfig(): AgentConfig {
  const apiUrl = env("TINYPLACE_API_URL", DEFAULT_API_URL).replace(/\/$/, "");
  const solanaRpcUrl = env("TINYPLACE_SOLANA_RPC_URL", DEFAULT_RPC_URL).replace(
    /\/$/,
    "",
  );
  const moonpaySecretKey = process.env["MOONPAY_SECRET_KEY"]?.trim();
  return {
    apiUrl,
    solanaRpcUrl,
    network: env("TINYPLACE_NETWORK", SOLANA_MAINNET_NETWORK),
    usdcMint: env("TINYPLACE_USDC_MINT", SOLANA_USDC_MINT),
    home: env("TINYPLACE_AGENT_HOME", join(homedir(), ".tinyplace-agent")),
    isLocal: looksLocal(solanaRpcUrl),
    moonpayApiKey: env(
      "NEXT_PUBLIC_MOONPAY_API_KEY",
      env("MOONPAY_API_KEY", DEFAULT_MOONPAY_KEY),
    ),
    moonpaySecretKey:
      moonpaySecretKey && moonpaySecretKey.length > 0
        ? moonpaySecretKey
        : undefined,
    moonpayEnv:
      env("MOONPAY_ENV", "sandbox") === "production" ? "production" : "sandbox",
  };
}
