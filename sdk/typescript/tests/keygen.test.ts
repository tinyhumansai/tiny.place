import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  defaultWorkerCount,
  generateVanityWallet,
  grindVanity,
  grindVanityParallel,
  runKeygen,
  validateVanityPrefix,
  WalletExistsError,
} from "../src/cli/keygen.js";
import type { CliContext, Flags } from "../src/cli/types.js";

describe("vanity keygen", () => {
  it("accepts any case of letters/digits-1-9 and rejects impossible characters", () => {
    expect(() => validateVanityPrefix("A1")).not.toThrow();
    expect(() => validateVanityPrefix("tiny")).not.toThrow();
    expect(() => validateVanityPrefix("TINY")).not.toThrow(); // case-insensitive -> valid
    expect(() => validateVanityPrefix("0x")).toThrowError(/never appear/); // base58 has no zero
    expect(() => validateVanityPrefix("a-b")).toThrowError(/never appear/); // no symbols
    expect(() => validateVanityPrefix("")).toThrowError(/--vanity/);
  });

  it("grinds an address with a leadable prefix (case-insensitive)", () => {
    // "1" leads ~1/25 of addresses, so this resolves in a handful of attempts.
    const hit = grindVanity("1", { timeoutMs: 10_000, now: () => Date.now() });
    expect(hit).not.toBeNull();
    expect(hit!.address.startsWith("1")).toBe(true);
    expect(hit!.seedHex).toMatch(/^[0-9a-f]{64}$/);
    expect(hit!.attempts).toBeGreaterThan(0);
  });

  it("returns null from grindVanity when the budget is already spent", () => {
    let tick = 0;
    const result = grindVanity("Q", {
      timeoutMs: 1,
      now: () => (tick += 1000),
    });
    expect(result).toBeNull();
  });

  it("generateVanityWallet falls back to a random wallet on timeout", () => {
    // Clock already past the deadline -> no grinding, random fallback.
    let tick = 0;
    const wallet = generateVanityWallet("zzz", {
      timeoutMs: 1,
      now: () => (tick += 1000),
    });
    expect(wallet.matched).toBe(false);
    expect(wallet.seedHex).toMatch(/^[0-9a-f]{64}$/);
    expect(wallet.address.length).toBeGreaterThan(30);
  });

  it("defaultWorkerCount leaves at least one usable worker", () => {
    expect(defaultWorkerCount()).toBeGreaterThanOrEqual(1);
  });

  // Regression for the key-overwrite incident: keygen must never silently
  // clobber an existing saved wallet.
  describe("does not overwrite an existing wallet", () => {
    let dir = "";
    let configPath = "";
    // "1" leads ~1/25 of addresses, so the grind lands fast.
    const flags: Flags = { vanity: "1", timeout: 5 };
    const ctxWith = (
      env: Record<string, string | undefined>,
      generated: boolean,
    ): CliContext =>
      ({
        env,
        generated,
        baseUrl: "http://localhost",
        fetch: globalThis.fetch,
      }) as unknown as CliContext;

    beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), "tp-keygen-"));
      configPath = join(dir, "config.json");
    });
    afterEach(async () => {
      await rm(dir, { recursive: true, force: true });
    });

    const savedKey = async (): Promise<string> => {
      const parsed = JSON.parse(await readFile(configPath, "utf8")) as {
        secretKey?: string;
      };
      return parsed.secretKey ?? "";
    };

    it("refuses to overwrite a real saved wallet without --force", async () => {
      const original = "11".repeat(32); // 64 hex chars
      await writeFile(configPath, JSON.stringify({ secretKey: original }));
      const env = { TINYPLACE_CONFIG: configPath };

      // generated=false => the on-disk key is a real wallet, not this run's throwaway.
      await expect(
        runKeygen(ctxWith(env, false), flags),
      ).rejects.toBeInstanceOf(WalletExistsError);
      expect(await savedKey()).toBe(original); // untouched
    });

    it("overwrites with --force", async () => {
      const original = "22".repeat(32);
      await writeFile(configPath, JSON.stringify({ secretKey: original }));
      const env = { TINYPLACE_CONFIG: configPath };

      await runKeygen(ctxWith(env, false), { ...flags, force: true });
      expect(await savedKey()).not.toBe(original);
      expect(await savedKey()).toMatch(/^[0-9a-f]{64}$/);
    });

    it("replaces this run's auto-generated throwaway without --force (new-user grind)", async () => {
      const throwaway = "33".repeat(32);
      await writeFile(configPath, JSON.stringify({ secretKey: throwaway }));
      const env = { TINYPLACE_CONFIG: configPath };

      // generated=true => the on-disk key was auto-made this invocation; safe to replace.
      await runKeygen(ctxWith(env, true), flags);
      expect(await savedKey()).not.toBe(throwaway);
    });

    it("writes a fresh key when no config exists", async () => {
      const env = { TINYPLACE_CONFIG: configPath };
      await runKeygen(ctxWith(env, true), flags);
      expect(await savedKey()).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  it("grindVanityParallel finds a leadable prefix (single worker -> sync path)", async () => {
    const hit = await grindVanityParallel("1", {
      timeoutMs: 10_000,
      workers: 1,
    });
    expect(hit).not.toBeNull();
    expect(hit!.address.startsWith("1")).toBe(true);
    expect(hit!.seedHex).toMatch(/^[0-9a-f]{64}$/);
  });

  it("grindVanityParallel resolves null when the budget is too small to land a rare prefix", async () => {
    // The compiled worker file is absent under the test runner's source view, so
    // this exercises the single-threaded fallback even with a multi-worker request.
    const result = await grindVanityParallel("zzz", {
      timeoutMs: 1,
      workers: 4,
    });
    expect(result).toBeNull();
  });
});
