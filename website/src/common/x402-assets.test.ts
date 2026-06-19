import { afterEach, describe, expect, it, vi } from "vitest";

import {
	assetDecimals,
	assetSymbol,
	isLikelyMintAddress,
	resolveSplAsset,
	resolveTokenAsset,
	sameAsset,
} from "@src/common/x402-assets";

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const WSOL_MINT = "So11111111111111111111111111111111111111112";

describe("resolveTokenAsset", () => {
	it("resolves a known symbol (case-insensitively)", () => {
		expect(resolveTokenAsset("usdc")?.mint).toBe(USDC_MINT);
		expect(resolveTokenAsset("USDC")?.decimals).toBe(6);
	});

	it("resolves a known mint address back to its symbol", () => {
		expect(resolveTokenAsset(USDC_MINT)?.symbol).toBe("USDC");
		expect(resolveTokenAsset(WSOL_MINT)?.symbol).toBe("WSOL");
	});

	it("treats an unknown base58 value as a bare mint", () => {
		const bare = "9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E";
		expect(resolveTokenAsset(bare)).toEqual({
			symbol: bare,
			mint: bare,
			decimals: 6,
			native: false,
		});
	});

	it("returns undefined for an empty or unknown non-address symbol", () => {
		expect(resolveTokenAsset("")).toBeUndefined();
		expect(resolveTokenAsset(undefined)).toBeUndefined();
		expect(resolveTokenAsset("WAT")).toBeUndefined();
	});
});

describe("assetSymbol", () => {
	it("maps a mint address to its friendly symbol", () => {
		expect(assetSymbol(USDC_MINT)).toBe("USDC");
	});

	it("defaults an empty value to USDC and uppercases unknowns", () => {
		expect(assetSymbol(undefined)).toBe("USDC");
		expect(assetSymbol("")).toBe("USDC");
		expect(assetSymbol("cash")).toBe("CASH");
		expect(assetSymbol("wat")).toBe("WAT");
	});
});

describe("assetDecimals", () => {
	it("resolves decimals by symbol or mint, defaulting to 6", () => {
		expect(assetDecimals("USDC")).toBe(6);
		expect(assetDecimals(WSOL_MINT)).toBe(9);
		expect(assetDecimals("SOL")).toBe(9);
		expect(assetDecimals("WAT")).toBe(6);
	});
});

describe("resolveSplAsset", () => {
	it("resolves USDC by symbol and by mint to the same mint + decimals", () => {
		expect(resolveSplAsset("USDC")).toEqual({ mint: USDC_MINT, decimals: 6 });
		expect(resolveSplAsset(USDC_MINT)).toEqual({ mint: USDC_MINT, decimals: 6 });
	});

	it("returns undefined for native SOL and unconfigured CASH", () => {
		expect(resolveSplAsset("SOL")).toBeUndefined();
		expect(resolveSplAsset("CASH")).toBeUndefined();
	});
});

describe("sameAsset", () => {
	it("treats a symbol and its mint address as the same token", () => {
		expect(sameAsset("USDC", USDC_MINT)).toBe(true);
		expect(sameAsset(USDC_MINT, "usdc")).toBe(true);
	});

	it("distinguishes genuinely different assets", () => {
		expect(sameAsset("USDC", WSOL_MINT)).toBe(false);
		expect(sameAsset("USDC", "CASH")).toBe(false);
	});

	it("falls back to a symbol comparison for unknown values", () => {
		expect(sameAsset("USDC-mint", "USDC-mint")).toBe(true);
		expect(sameAsset("evil-mint", "USDC-mint")).toBe(false);
	});
});

describe("isLikelyMintAddress", () => {
	it("accepts base58 mint pubkeys and rejects symbols", () => {
		expect(isLikelyMintAddress(USDC_MINT)).toBe(true);
		expect(isLikelyMintAddress("USDC")).toBe(false);
		expect(isLikelyMintAddress("USDC-mint")).toBe(false);
	});
});

describe("environment overrides", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("honors NEXT_PUBLIC_SOLANA_CASH_MINT for CASH resolution", () => {
		const cash = "Cash111111111111111111111111111111111111111";
		vi.stubEnv("NEXT_PUBLIC_SOLANA_CASH_MINT", cash);
		expect(resolveSplAsset("CASH")).toEqual({ mint: cash, decimals: 6 });
		expect(assetSymbol(cash)).toBe("CASH");
	});
});
