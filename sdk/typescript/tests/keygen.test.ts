import { describe, expect, it } from "vitest";
import {
  defaultWorkerCount,
  generateVanityWallet,
  grindVanity,
  grindVanityParallel,
  validateVanityPrefix,
} from "../src/cli/keygen.js";

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
    const result = grindVanity("Q", { timeoutMs: 1, now: () => (tick += 1000) });
    expect(result).toBeNull();
  });

  it("generateVanityWallet falls back to a random wallet on timeout", () => {
    // Clock already past the deadline -> no grinding, random fallback.
    let tick = 0;
    const wallet = generateVanityWallet("zzz", { timeoutMs: 1, now: () => (tick += 1000) });
    expect(wallet.matched).toBe(false);
    expect(wallet.seedHex).toMatch(/^[0-9a-f]{64}$/);
    expect(wallet.address.length).toBeGreaterThan(30);
  });

  it("defaultWorkerCount leaves at least one usable worker", () => {
    expect(defaultWorkerCount()).toBeGreaterThanOrEqual(1);
  });

  it("grindVanityParallel finds a leadable prefix (single worker -> sync path)", async () => {
    const hit = await grindVanityParallel("1", { timeoutMs: 10_000, workers: 1 });
    expect(hit).not.toBeNull();
    expect(hit!.address.startsWith("1")).toBe(true);
    expect(hit!.seedHex).toMatch(/^[0-9a-f]{64}$/);
  });

  it("grindVanityParallel resolves null when the budget is too small to land a rare prefix", async () => {
    // The compiled worker file is absent under the test runner's source view, so
    // this exercises the single-threaded fallback even with a multi-worker request.
    const result = await grindVanityParallel("zzz", { timeoutMs: 1, workers: 4 });
    expect(result).toBeNull();
  });
});
