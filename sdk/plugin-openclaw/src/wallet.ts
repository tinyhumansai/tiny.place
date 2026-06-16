/**
 * Self-custodied agent wallet with encrypted-at-rest credential storage.
 *
 * The agent's only long-lived secret is a 32-byte Ed25519 seed. We never write
 * it in plaintext: it is sealed with AES-256-GCM. The data key comes from one
 * of two sources, in priority order:
 *
 *   1. TINYPLACE_WALLET_PASSPHRASE — scrypt(passphrase, salt). Nothing secret
 *      ever touches disk; the agent must supply the passphrase to unlock.
 *   2. A machine-local random key stored next to the vault as `vault.key` with
 *      0600 permissions. This protects the seed against casual disk reads and
 *      backups while keeping the wallet usable unattended (the common agent
 *      case). Set a passphrase for stronger isolation.
 *
 * The public identity (agentId / Solana address + public key) is stored in the
 * clear so read-only commands (`status`, `card`, polling) work without unlock.
 */
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { join } from "node:path";

import { LocalSigner } from "@tinyhumansai/tinyplace";

import type { AgentConfig } from "./config.js";

const VAULT_VERSION = 1;
// maxmem must exceed scrypt's ~128*N*r bytes (≈33.5 MiB at N=2^15, r=8), which
// is above Node's 32 MiB default — without it scryptSync throws
// ERR_CRYPTO_INVALID_SCRYPT_PARAMS and passphrase-protected vaults can be
// neither created nor unlocked.
const SCRYPT_PARAMS = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;

interface VaultFile {
  v: number;
  agentId: string;
  publicKeyBase64: string;
  createdAt: string;
  keyMode: "passphrase" | "keyfile";
  salt: string; // base64 (scrypt salt; unused for keyfile mode but kept)
  iv: string; // base64
  authTag: string; // base64
  ciphertext: string; // base64 (encrypted 32-byte seed)
}

export interface WalletInfo {
  agentId: string;
  publicKeyBase64: string;
  createdAt: string;
  keyMode: VaultFile["keyMode"];
}

function vaultPath(config: AgentConfig): string {
  return join(config.home, "vault.json");
}

function keyFilePath(config: AgentConfig): string {
  return join(config.home, "vault.key");
}

function ensureHome(config: AgentConfig): void {
  if (!existsSync(config.home)) {
    mkdirSync(config.home, { recursive: true, mode: 0o700 });
  }
}

/** Resolves the 32-byte AES data key, creating a keyfile if needed. */
function resolveDataKey(
  config: AgentConfig,
  salt: Buffer,
  mode: VaultFile["keyMode"],
): Buffer {
  if (mode === "passphrase") {
    const passphrase = process.env["TINYPLACE_WALLET_PASSPHRASE"];
    if (!passphrase || passphrase.length === 0) {
      throw new Error(
        "wallet is passphrase-protected but TINYPLACE_WALLET_PASSPHRASE is not set",
      );
    }
    return scryptSync(passphrase, salt, 32, SCRYPT_PARAMS);
  }
  const path = keyFilePath(config);
  if (!existsSync(path)) {
    const key = randomBytes(32);
    writeFileSync(path, key.toString("base64"), { mode: 0o600 });
    chmodSync(path, 0o600);
    return key;
  }
  return Buffer.from(readFileSync(path, "utf8").trim(), "base64");
}

export function walletExists(config: AgentConfig): boolean {
  return existsSync(vaultPath(config));
}

export function readWalletInfo(config: AgentConfig): WalletInfo {
  const raw = readFileSync(vaultPath(config), "utf8");
  const vault = JSON.parse(raw) as VaultFile;
  return {
    agentId: vault.agentId,
    publicKeyBase64: vault.publicKeyBase64,
    createdAt: vault.createdAt,
    keyMode: vault.keyMode,
  };
}

/** Generates a fresh wallet and seals its seed. Throws if one already exists. */
export async function createWallet(
  config: AgentConfig,
  options: { force?: boolean; seedHex?: string } = {},
): Promise<WalletInfo> {
  ensureHome(config);
  if (walletExists(config) && !options.force) {
    throw new Error(
      `a wallet already exists at ${vaultPath(config)} (use --force to overwrite)`,
    );
  }
  const seed = options.seedHex
    ? Buffer.from(options.seedHex.replace(/^0x/, ""), "hex")
    : randomBytes(32);
  if (seed.length !== 32) {
    throw new Error("seed must be exactly 32 bytes (64 hex chars)");
  }
  const signer = await LocalSigner.fromSeed(new Uint8Array(seed));

  const usePassphrase = Boolean(process.env["TINYPLACE_WALLET_PASSPHRASE"]);
  const keyMode: VaultFile["keyMode"] = usePassphrase
    ? "passphrase"
    : "keyfile";
  const salt = randomBytes(16);
  const dataKey = resolveDataKey(config, salt, keyMode);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", dataKey, iv);
  const ciphertext = Buffer.concat([cipher.update(seed), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const vault: VaultFile = {
    v: VAULT_VERSION,
    agentId: signer.agentId,
    publicKeyBase64: signer.publicKeyBase64,
    createdAt: new Date().toISOString(),
    keyMode,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
  writeFileSync(vaultPath(config), JSON.stringify(vault, null, 2), {
    mode: 0o600,
  });
  chmodSync(vaultPath(config), 0o600);
  return readWalletInfo(config);
}

/** Decrypts the seed and returns a usable signer. */
export async function unlockWallet(config: AgentConfig): Promise<LocalSigner> {
  if (!walletExists(config)) {
    throw new Error(
      "no wallet found — run `tinyplace-agent wallet create` first",
    );
  }
  const vault = JSON.parse(
    readFileSync(vaultPath(config), "utf8"),
  ) as VaultFile;
  const salt = Buffer.from(vault.salt, "base64");
  const dataKey = resolveDataKey(config, salt, vault.keyMode);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    dataKey,
    Buffer.from(vault.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(vault.authTag, "base64"));
  let seed: Buffer;
  try {
    seed = Buffer.concat([
      decipher.update(Buffer.from(vault.ciphertext, "base64")),
      decipher.final(),
    ]);
  } catch {
    throw new Error(
      "failed to decrypt wallet — wrong passphrase or corrupted vault",
    );
  }
  return LocalSigner.fromSeed(new Uint8Array(seed));
}

/** Returns the raw seed as hex (for backup/export). Requires unlock. */
export function exportSeedHex(config: AgentConfig): string {
  const vault = JSON.parse(
    readFileSync(vaultPath(config), "utf8"),
  ) as VaultFile;
  const salt = Buffer.from(vault.salt, "base64");
  const dataKey = resolveDataKey(config, salt, vault.keyMode);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    dataKey,
    Buffer.from(vault.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(vault.authTag, "base64"));
  const seed = Buffer.concat([
    decipher.update(Buffer.from(vault.ciphertext, "base64")),
    decipher.final(),
  ]);
  return seed.toString("hex");
}
