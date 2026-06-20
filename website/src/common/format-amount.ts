// Pure helpers for rendering x402 payment amounts. The server's 402 challenge
// (and the X402ConfirmRequest derived from it) carries amounts in the asset's
// smallest unit ("base units" / minor units), e.g. 1_000_000 for 1 USDC. These
// MUST be divided by 10^decimals before display, or the UI shows a number that
// is 10^decimals larger than what the wallet actually signs.
//
// The challenge's `asset` field is now the on-chain SPL *mint address*, not a
// symbol, so decimals/symbol are resolved through the x402-assets registry
// (which maps mint <-> symbol). Kept free of SDK/web3 imports so it can be
// unit-tested in isolation and pulled into lightweight components (the confirm
// dialog) without dragging in the Solana web3 bundle.

import { assetDecimals, assetSymbol } from "@src/common/x402-assets";

/** Decimals for an x402 asset (symbol or mint); defaults to 6 when unknown. */
export function tokenDecimals(asset?: string): number {
	return assetDecimals(asset);
}

/**
 * Converts a base-unit (minor-unit) integer string to its decimal token value
 * as a string, e.g. ("1000000", 6) => "1". Returns "0" for non-finite input.
 */
export function minorUnitsToDecimal(
	baseUnits: string,
	decimals: number
): string {
	const n = Number(baseUnits);
	if (!Number.isFinite(n)) {
		return "0";
	}
	return String(n / 10 ** decimals);
}

/**
 * Formats a base-unit amount for display with its friendly asset symbol,
 * resolving both the asset's decimals and symbol from its value (a symbol or an
 * SPL mint address), e.g. ("1000000", "USDC") => "1 USDC" and
 * ("1000000", "EPjFW…Dt1v") => "1 USDC".
 */
export function formatTokenAmount(baseUnits: string, asset?: string): string {
	const decimals = tokenDecimals(asset);
	const human = Number(minorUnitsToDecimal(baseUnits, decimals));
	const symbol = assetSymbol(asset);
	return `${human.toLocaleString(undefined, {
		maximumFractionDigits: decimals,
	})} ${symbol}`;
}

/**
 * Formats a base-unit amount of a USD-pegged asset (USDC/CASH) as a dollar
 * string, e.g. ("1000000", "USDC") => "$1.00". The backend reports activity
 * volume in 6-decimal base units, so rendering it behind a literal "$" without
 * scaling overstates the figure by 10^decimals (1 USDC shows as "$1000000.00").
 */
export function formatUsdFromBaseUnits(
	baseUnits: string,
	asset?: string
): string {
	const dollars = Number(minorUnitsToDecimal(baseUnits, tokenDecimals(asset)));
	return `$${dollars.toLocaleString(undefined, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})}`;
}
