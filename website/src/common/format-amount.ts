// Pure helpers for rendering x402 payment amounts. The server's 402 challenge
// (and the X402ConfirmRequest derived from it) carries amounts in the asset's
// smallest unit ("base units" / minor units), e.g. 1_000_000 for 1 USDC. These
// MUST be divided by 10^decimals before display, or the UI shows a number that
// is 10^decimals larger than what the wallet actually signs.
//
// Kept free of SDK/web3 imports so it can be unit-tested in isolation and pulled
// into lightweight components (the confirm dialog) without dragging in the
// Solana web3 bundle. USDC and CASH are both 6-decimal SPL tokens.

const ASSET_DECIMALS: Record<string, number> = {
	USDC: 6,
	CASH: 6,
};

/** Decimals for an x402 asset symbol; defaults to 6 (USDC/CASH) when unknown. */
export function tokenDecimals(asset?: string): number {
	return ASSET_DECIMALS[(asset ?? "USDC").toUpperCase()] ?? 6;
}

/**
 * Converts a base-unit (minor-unit) integer string to its decimal token value
 * as a string, e.g. ("1000000", 6) => "1". Returns "0" for non-finite input.
 */
export function minorUnitsToDecimal(baseUnits: string, decimals: number): string {
	const n = Number(baseUnits);
	if (!Number.isFinite(n)) {
		return "0";
	}
	return String(n / 10 ** decimals);
}

/**
 * Formats a base-unit amount for display with its asset symbol, resolving the
 * asset's decimals, e.g. ("1000000", "USDC") => "1 USDC".
 */
export function formatTokenAmount(baseUnits: string, asset?: string): string {
	const decimals = tokenDecimals(asset);
	const human = Number(minorUnitsToDecimal(baseUnits, decimals));
	const symbol = (asset ?? "USDC").toUpperCase();
	return `${human.toLocaleString(undefined, {
		maximumFractionDigits: decimals,
	})} ${symbol}`;
}
