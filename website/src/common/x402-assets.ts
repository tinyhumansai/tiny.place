// Hardcoded x402 token registry for the web app. The backend's 402 challenge
// now advertises the on-chain SPL *mint address* in `asset` (per the x402
// exact-scheme spec), not a symbol like "USDC". The web app must echo the mint
// address back to the server but show the friendly symbol to the user. This
// module maps between the two with a small hardcoded table — env-overridable for
// devnet/local mints. A `/payments/supported`-backed resolver can replace it
// later; these mints are stable for now.
//
// Kept free of SDK/web3 imports so it stays lightweight and unit-testable (and
// safe to pull into the confirm dialog without the Solana web3 bundle).

const MAINNET_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const MAINNET_WSOL_MINT = "So11111111111111111111111111111111111111112";

/**
 * The USDC SPL mint. Defaults to the mainnet mint but is overridable via
 * NEXT_PUBLIC_SOLANA_USDC_MINT so devnet/test stacks (a different mint) resolve
 * the correct token accounts.
 */
export function usdcMint(): string {
	return process.env["NEXT_PUBLIC_SOLANA_USDC_MINT"] ?? MAINNET_USDC_MINT;
}

/**
 * The CASH ($1 stablecoin) SPL mint from NEXT_PUBLIC_SOLANA_CASH_MINT (a dev
 * mint locally, the real mint in production). Returns "" when unconfigured —
 * CASH is only offered once a mint is set, mirroring the backend's CASH_MINT
 * gate.
 */
export function cashMint(): string {
	return process.env["NEXT_PUBLIC_SOLANA_CASH_MINT"] ?? "";
}

/** The wrapped-SOL (WSOL) SPL mint, overridable via NEXT_PUBLIC_SOLANA_WSOL_MINT. */
export function wsolMint(): string {
	return process.env["NEXT_PUBLIC_SOLANA_WSOL_MINT"] ?? MAINNET_WSOL_MINT;
}

export interface TokenAssetInfo {
	symbol: string;
	/** On-chain SPL mint; "" for native SOL or an unconfigured CASH mint. */
	mint: string;
	decimals: number;
	native: boolean;
}

function registry(): Array<TokenAssetInfo> {
	return [
		{ symbol: "SOL", mint: "", decimals: 9, native: true },
		{ symbol: "USDC", mint: usdcMint(), decimals: 6, native: false },
		{ symbol: "WSOL", mint: wsolMint(), decimals: 9, native: false },
		{ symbol: "CASH", mint: cashMint(), decimals: 6, native: false },
	];
}

const BASE58_MINT_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** True when the value looks like a base58 SPL mint address (not a symbol). */
export function isLikelyMintAddress(value: string): boolean {
	return BASE58_MINT_PATTERN.test(value.trim());
}

/**
 * Resolves an x402 `asset` — a symbol ("USDC") or, as the 402 challenge now
 * advertises, an on-chain SPL mint address — to its token info, matching both
 * fields case-insensitively. An unknown but base58-shaped value is treated as a
 * bare mint (decimals default to 6). Returns undefined for an empty value or an
 * unknown non-address symbol.
 */
export function resolveTokenAsset(value?: string): TokenAssetInfo | undefined {
	const raw = (value ?? "").trim();
	if (raw === "") {
		return undefined;
	}
	const upper = raw.toUpperCase();
	for (const asset of registry()) {
		if (asset.symbol === upper) {
			return asset;
		}
		if (asset.mint && asset.mint.toLowerCase() === raw.toLowerCase()) {
			return asset;
		}
	}
	if (isLikelyMintAddress(raw)) {
		return { symbol: raw, mint: raw, decimals: 6, native: false };
	}
	return undefined;
}

/**
 * Friendly display symbol for an x402 `asset` (symbol or mint address). Defaults
 * to "USDC" for an empty value (the historical default) and echoes back an
 * unknown non-address symbol (uppercased).
 */
export function assetSymbol(value?: string): string {
	const raw = (value ?? "").trim();
	if (raw === "") {
		return "USDC";
	}
	return resolveTokenAsset(raw)?.symbol ?? raw.toUpperCase();
}

/** Decimals for an x402 `asset` (symbol or mint); defaults to 6 when unknown. */
export function assetDecimals(value?: string): number {
	return resolveTokenAsset(value)?.decimals ?? 6;
}

/**
 * Resolves an x402 `asset` to its SPL mint + decimals for the Solana settlement
 * path. Returns undefined for assets that cannot settle as an SPL
 * TransferChecked — native SOL (the facilitators don't support it), CASH without
 * a configured mint, and unknown non-address symbols.
 */
export function resolveSplAsset(
	value?: string
): { mint: string; decimals: number } | undefined {
	const asset = resolveTokenAsset(value ?? "USDC");
	if (!asset || asset.native || !asset.mint) {
		return undefined;
	}
	return { mint: asset.mint, decimals: asset.decimals };
}

/**
 * True when two x402 `asset` values denote the same token, so a symbol-valued
 * expectation ("USDC") matches a mint-valued challenge and vice versa. Compares
 * by mint when both resolve to an SPL token, else by symbol.
 */
export function sameAsset(a?: string, b?: string): boolean {
	const ra = resolveTokenAsset(a);
	const rb = resolveTokenAsset(b);
	if (ra && rb) {
		if (ra.mint && rb.mint) {
			return ra.mint.toLowerCase() === rb.mint.toLowerCase();
		}
		return ra.symbol === rb.symbol;
	}
	return (a ?? "").trim().toUpperCase() === (b ?? "").trim().toUpperCase();
}
