import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import {
  SOLANA_MAINNET_NETWORK,
  SOLANA_USDC_MINT,
} from "@tinyhumansai/tinyplace";

import { loadConfig } from "./config.js";

// Keys loadConfig reads — cleared/restored around each test for isolation.
const ENV_KEYS = [
  "TINYPLACE_API_URL",
  "TINYPLACE_SOLANA_RPC_URL",
  "TINYPLACE_NETWORK",
  "TINYPLACE_USDC_MINT",
  "TINYPLACE_AGENT_HOME",
  "TINYPLACE_HARNESS_KEY",
  "NEXT_PUBLIC_MOONPAY_API_KEY",
  "MOONPAY_API_KEY",
  "MOONPAY_SECRET_KEY",
  "MOONPAY_ENV",
] as const;

const DEFAULT_MOONPAY_KEY = "pk_test_oPfe89bYFJ6NJqrxXrZ4srpDInxvicu";

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

test("loadConfig uses staging API + mainnet RPC defaults and isLocal:false", () => {
  const config = loadConfig();
  assert.equal(config.apiUrl, "https://staging-api.tiny.place");
  assert.equal(config.solanaRpcUrl, "https://api.mainnet-beta.solana.com");
  assert.equal(config.network, SOLANA_MAINNET_NETWORK);
  assert.equal(config.usdcMint, SOLANA_USDC_MINT);
  assert.equal(config.harnessKey, "openclaw-v1");
  assert.equal(config.isLocal, false);
  assert.equal(config.moonpayApiKey, DEFAULT_MOONPAY_KEY);
  assert.equal(config.moonpaySecretKey, undefined);
  assert.equal(config.moonpayEnv, "sandbox");
});

test("loadConfig strips a trailing slash from apiUrl and solanaRpcUrl", () => {
  process.env["TINYPLACE_API_URL"] = "https://example.test/";
  process.env["TINYPLACE_SOLANA_RPC_URL"] = "https://rpc.test/";
  const config = loadConfig();
  assert.equal(config.apiUrl, "https://example.test");
  assert.equal(config.solanaRpcUrl, "https://rpc.test");
});

test("loadConfig sets isLocal:true for a localhost RPC", () => {
  process.env["TINYPLACE_SOLANA_RPC_URL"] = "http://localhost:8899";
  assert.equal(loadConfig().isLocal, true);
});

test("loadConfig sets isLocal:true for a 127.0.0.1 RPC", () => {
  process.env["TINYPLACE_SOLANA_RPC_URL"] = "http://127.0.0.1:8899";
  assert.equal(loadConfig().isLocal, true);
});

test("loadConfig coerces moonpayEnv to production only on an exact match", () => {
  process.env["MOONPAY_ENV"] = "production";
  assert.equal(loadConfig().moonpayEnv, "production");

  process.env["MOONPAY_ENV"] = "PRODUCTION";
  assert.equal(loadConfig().moonpayEnv, "sandbox");

  process.env["MOONPAY_ENV"] = "anything-else";
  assert.equal(loadConfig().moonpayEnv, "sandbox");
});

test("loadConfig prefers NEXT_PUBLIC_MOONPAY_API_KEY over MOONPAY_API_KEY", () => {
  process.env["NEXT_PUBLIC_MOONPAY_API_KEY"] = "pk_next";
  process.env["MOONPAY_API_KEY"] = "pk_plain";
  assert.equal(loadConfig().moonpayApiKey, "pk_next");
});

test("loadConfig falls back to MOONPAY_API_KEY when NEXT_PUBLIC is unset", () => {
  process.env["MOONPAY_API_KEY"] = "pk_plain";
  assert.equal(loadConfig().moonpayApiKey, "pk_plain");
});

test("loadConfig treats a whitespace-only MOONPAY_SECRET_KEY as undefined", () => {
  process.env["MOONPAY_SECRET_KEY"] = "   ";
  assert.equal(loadConfig().moonpaySecretKey, undefined);
});

test("loadConfig trims and keeps a real MOONPAY_SECRET_KEY", () => {
  process.env["MOONPAY_SECRET_KEY"] = "  sk_secret  ";
  assert.equal(loadConfig().moonpaySecretKey, "sk_secret");
});
