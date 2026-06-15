import { describe, expect, it } from "vitest";

import {
	formatUnits,
	tokenAssetsWithUsdcFallback,
} from "./use-wallet-balances";

describe("wallet balance helpers", () => {
	it("formats native and token base units without trailing zeroes", () => {
		expect(formatUnits(1_500_000_000n, 9)).toBe("1.5");
		expect(formatUnits(42_000_000n, 6)).toBe("42");
	});

	it("keeps configured token assets and always includes USDC metadata", () => {
		const assets = tokenAssetsWithUsdcFallback([
			{
				address: "So11111111111111111111111111111111111111112",
				decimals: 9,
				symbol: "WSOL",
			},
		]);

		expect(assets).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ symbol: "WSOL" }),
				expect.objectContaining({ decimals: 6, symbol: "USDC" }),
			])
		);
	});
});
