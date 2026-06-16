import assert from "node:assert/strict";
import test from "node:test";

import { buildOffRampUrl, buildOnRampUrl } from "./moonpay.js";

import type { AgentConfig } from "./config.js";

function config(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    apiUrl: "http://localhost:8080",
    solanaRpcUrl: "http://localhost:8899",
    network: "solana-localnet",
    usdcMint: "usdc-mint",
    home: "/tmp/tinyplace-agent-test",
    harnessKey: "openclaw-vtest",
    isLocal: true,
    moonpayApiKey: "pk_test",
    moonpaySecretKey: undefined,
    moonpayEnv: "sandbox",
    ...overrides,
  };
}

test("buildOnRampUrl creates a sandbox USDC-on-Solana buy link", () => {
  const link = buildOnRampUrl(config(), "Wallet111", 25);
  const url = new URL(link.url);

  assert.equal(link.kind, "buy");
  assert.equal(link.environment, "sandbox");
  assert.equal(link.signed, false);
  assert.equal(url.hostname, "buy-sandbox.moonpay.com");
  assert.equal(url.searchParams.get("apiKey"), "pk_test");
  assert.equal(url.searchParams.get("currencyCode"), "usdc_sol");
  assert.equal(url.searchParams.get("walletAddress"), "Wallet111");
  assert.equal(url.searchParams.get("baseCurrencyAmount"), "25");
});

test("buildOffRampUrl signs production sell links when a secret is configured", () => {
  const link = buildOffRampUrl(
    config({ moonpayEnv: "production", moonpaySecretKey: "secret" }),
    "Wallet111",
    10,
  );
  const url = new URL(link.url);

  assert.equal(link.kind, "sell");
  assert.equal(link.environment, "production");
  assert.equal(link.signed, true);
  assert.equal(url.hostname, "sell.moonpay.com");
  assert.equal(url.searchParams.get("baseCurrencyCode"), "usdc_sol");
  assert.equal(url.searchParams.get("quoteCurrencyCode"), "usd");
  assert.equal(url.searchParams.get("refundWalletAddress"), "Wallet111");
  assert.equal(url.searchParams.get("baseCurrencyAmount"), "10");
  assert.match(url.searchParams.get("signature") ?? "", /.+/);
});
