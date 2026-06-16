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

function withTempHome(fn: (agentConfig: AgentConfig) => Promise<void>): () => Promise<void> {
  return async () => {
    const home = mkdtempSync(join(tmpdir(), "tinyplace-wallet-"));
    try {
      await fn(config(home));
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  };
}

test(
  "createWallet throws when a vault already exists and force is not set",
  withTempHome(async (agentConfig) => {
    await createWallet(agentConfig, { seedHex: SEED_HEX });
    await assert.rejects(
      createWallet(agentConfig, { seedHex: SEED_HEX }),
      /a wallet already exists/,
    );
  }),
);

test(
  "createWallet overwrites an existing vault when force is set",
  withTempHome(async (agentConfig) => {
    const first = await createWallet(agentConfig, { seedHex: SEED_HEX });
    const otherSeed =
      "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
    const second = await createWallet(agentConfig, {
      seedHex: otherSeed,
      force: true,
    });
    assert.notEqual(second.agentId, first.agentId);
    assert.equal(exportSeedHex(agentConfig), otherSeed);
  }),
);

test(
  "createWallet rejects a seed that is not 32 bytes",
  withTempHome(async (agentConfig) => {
    await assert.rejects(
      createWallet(agentConfig, { seedHex: "00010203" }),
      /seed must be exactly 32 bytes/,
    );
  }),
);

test(
  "unlockWallet throws when no wallet exists",
  withTempHome(async (agentConfig) => {
    await assert.rejects(unlockWallet(agentConfig), /no wallet found/);
  }),
);

// Regression test for the scrypt maxmem bug: wallet.ts called scryptSync with
// N=2^15, r=8 (≈33.5 MiB) without raising `maxmem` above Node's 32 MiB default,
// so it threw ERR_CRYPTO_INVALID_SCRYPT_PARAMS and passphrase-protected wallets
// could neither be created nor unlocked. SCRYPT_PARAMS now sets maxmem to 64 MiB.
test(
  "passphrase wallet unlocks with the right passphrase and fails with the wrong one",
  withTempHome(async (agentConfig) => {
    const previous = process.env["TINYPLACE_WALLET_PASSPHRASE"];
    process.env["TINYPLACE_WALLET_PASSPHRASE"] = "correct horse battery";
    try {
      const created = await createWallet(agentConfig, { seedHex: SEED_HEX });
      assert.equal(readWalletInfo(agentConfig).keyMode, "passphrase");

      const signer = await unlockWallet(agentConfig);
      assert.equal(signer.agentId, created.agentId);

      process.env["TINYPLACE_WALLET_PASSPHRASE"] = "wrong passphrase";
      await assert.rejects(unlockWallet(agentConfig), /failed to decrypt wallet/);

      delete process.env["TINYPLACE_WALLET_PASSPHRASE"];
      await assert.rejects(
        unlockWallet(agentConfig),
        /TINYPLACE_WALLET_PASSPHRASE is not set/,
      );
    } finally {
      if (previous === undefined) delete process.env["TINYPLACE_WALLET_PASSPHRASE"];
      else process.env["TINYPLACE_WALLET_PASSPHRASE"] = previous;
    }
  }),
);
