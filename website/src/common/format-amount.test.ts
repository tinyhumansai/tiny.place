import { describe, expect, it } from "vitest";

import {
	formatTokenAmount,
	minorUnitsToDecimal,
	tokenDecimals,
} from "@src/common/format-amount";

describe("tokenDecimals", () => {
	it("returns 6 for USDC, CASH, and unknown assets", () => {
		expect(tokenDecimals("USDC")).toBe(6);
		expect(tokenDecimals("cash")).toBe(6);
		expect(tokenDecimals(undefined)).toBe(6);
		expect(tokenDecimals("WHATEVER")).toBe(6);
	});
});

describe("minorUnitsToDecimal", () => {
	it("divides base units by 10^decimals", () => {
		expect(minorUnitsToDecimal("1000000", 6)).toBe("1");
		expect(minorUnitsToDecimal("5000", 6)).toBe("0.005");
		expect(minorUnitsToDecimal("120000", 6)).toBe("0.12");
	});

	it("returns 0 for non-finite input", () => {
		expect(minorUnitsToDecimal("not-a-number", 6)).toBe("0");
	});
});

describe("formatTokenAmount", () => {
	it("renders base units as the decimal token value with symbol", () => {
		// The registration fees: $1 (2-char) and $0.005 (5+-char) in base units.
		expect(formatTokenAmount("1000000", "USDC")).toBe("1 USDC");
		expect(formatTokenAmount("5000", "USDC")).toBe("0.005 USDC");
		expect(formatTokenAmount("120000", "USDC")).toBe("0.12 USDC");
	});

	it("defaults the symbol to USDC", () => {
		expect(formatTokenAmount("2000000")).toBe("2 USDC");
	});

	it("uppercases the asset symbol", () => {
		expect(formatTokenAmount("1000000", "cash")).toBe("1 CASH");
	});
});
