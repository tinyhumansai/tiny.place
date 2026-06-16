import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createWallet,
  exportSeedHex,
  readWalletInfo,
  unlockWallet,
  walletExists,
} from "./wallet.js";

import type { AgentConfig } from "./config.js";

const SEED_HEX =
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

function config(home: string): AgentConfig {
  return {
    apiUrl: "http://localhost:8080",
    solanaRpcUrl: "http://localhost:8899",
    network: "solana-localnet",
    usdcMint: "usdc-mint",
    home,
    harnessKey: "openclaw-vtest",
    isLocal: true,
    moonpayApiKey: "pk_test",
    moonpaySecretKey: undefined,
    moonpayEnv: "sandbox",
  };
}

test("createWallet seals the seed and unlockWallet restores the signer", async () => {
  const home = mkdtempSync(join(tmpdir(), "tinyplace-wallet-"));
  const agentConfig = config(home);

  try {
    const created = await createWallet(agentConfig, { seedHex: SEED_HEX });
    const info = readWalletInfo(agentConfig);
    const vault = JSON.parse(readFileSync(join(home, "vault.json"), "utf8")) as {
      ciphertext: string;
      keyMode: string;
    };
    const signer = await unlockWallet(agentConfig);

    assert.equal(walletExists(agentConfig), true);
    assert.equal(info.agentId, created.agentId);
    assert.equal(info.keyMode, "keyfile");
    assert.equal(vault.keyMode, "keyfile");
    assert.notEqual(Buffer.from(vault.ciphertext, "base64").toString("hex"), SEED_HEX);
    assert.equal(signer.agentId, created.agentId);
    assert.equal(exportSeedHex(agentConfig), SEED_HEX);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
