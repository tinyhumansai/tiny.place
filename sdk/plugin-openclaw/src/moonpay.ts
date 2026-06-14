/**
 * MoonPay on-ramp / off-ramp link generation for the agent wallet.
 *
 * tiny.place settles in USDC on Solana, so the agent funds itself by buying
 * `usdc_sol` straight into its own wallet address and cashes out by selling it
 * back to fiat. This mirrors website/src/common/moonpay.ts (same currency
 * codes + sandbox key) but produces a shareable/launchable URL instead of an
 * embedded React widget, so a headless agent can hand the link to its operator
 * or open it itself.
 *
 * When MOONPAY_SECRET_KEY is set we HMAC-sign the URL (MoonPay's required
 * scheme for production); otherwise we emit an unsigned sandbox URL, which is
 * enough for the widget to render in test mode.
 */
import { createHmac } from "node:crypto";

import type { AgentConfig } from "./config.js";

// MoonPay's currency code for USDC on Solana — buys/sells settle to/from the
// agent's SOL wallet in USDC.
const USDC_SOLANA = "usdc_sol";
const FIAT = "usd";

function host(kind: "buy" | "sell", env: "sandbox" | "production"): string {
  const suffix = env === "production" ? "" : "-sandbox";
  return `https://${kind}${suffix}.moonpay.com`;
}

function sign(config: AgentConfig, query: string): string {
  if (!config.moonpaySecretKey) return query;
  // MoonPay signs the entire query string (including the leading "?").
  const signature = createHmac("sha256", config.moonpaySecretKey)
    .update(query)
    .digest("base64");
  return `${query}&signature=${encodeURIComponent(signature)}`;
}

export interface RampLink {
  kind: "buy" | "sell";
  url: string;
  signed: boolean;
  environment: "sandbox" | "production";
}

/** On-ramp: fiat → USDC on Solana, delivered to the agent's wallet. */
export function buildOnRampUrl(
  config: AgentConfig,
  walletAddress: string,
  fiatAmount?: number,
): RampLink {
  const params = new URLSearchParams({
    apiKey: config.moonpayApiKey,
    currencyCode: USDC_SOLANA,
    walletAddress,
    baseCurrencyCode: FIAT,
  });
  if (fiatAmount && fiatAmount > 0) {
    params.set("baseCurrencyAmount", String(fiatAmount));
  }
  const query = `?${params.toString()}`;
  return {
    kind: "buy",
    url: `${host("buy", config.moonpayEnv)}${sign(config, query)}`,
    signed: Boolean(config.moonpaySecretKey),
    environment: config.moonpayEnv,
  };
}

/** Off-ramp: USDC on Solana → fiat, refunded to the agent's wallet. */
export function buildOffRampUrl(
  config: AgentConfig,
  walletAddress: string,
  usdcAmount?: number,
): RampLink {
  const params = new URLSearchParams({
    apiKey: config.moonpayApiKey,
    baseCurrencyCode: USDC_SOLANA,
    quoteCurrencyCode: FIAT,
    refundWalletAddress: walletAddress,
  });
  if (usdcAmount && usdcAmount > 0) {
    params.set("baseCurrencyAmount", String(usdcAmount));
  }
  const query = `?${params.toString()}`;
  return {
    kind: "sell",
    url: `${host("sell", config.moonpayEnv)}${sign(config, query)}`,
    signed: Boolean(config.moonpaySecretKey),
    environment: config.moonpayEnv,
  };
}
