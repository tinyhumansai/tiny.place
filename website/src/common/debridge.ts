// deBridge cross-chain swap deep links, used as the "fund with crypto" option:
// the user bridges an asset from another chain into USDC on their Solana wallet.
//
// The link opens deBridge's hosted app pre-filled with the destination wallet
// and the USDC-on-Solana output token. The input chain/currency are defaults the
// user can change on deBridge; we intentionally do not pre-fill an amount because
// deBridge's `amount` is denominated in the input token, not USD.

const DEBRIDGE_APP_URL = "https://app.debridge.com/";

// deBridge's internal numeric chain ids.
const DEBRIDGE_ETHEREUM_CHAIN_ID = "1";
const DEBRIDGE_SOLANA_CHAIN_ID = "7565164";

// USDC SPL mint on Solana — the asset bridged funds settle into.
export const USDC_SOLANA_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

/**
 * Builds a deBridge deep link that bridges crypto from Ethereum into USDC on the
 * given Solana wallet. Returns an `app.debridge.com` URL safe to open in a new
 * tab.
 */
export const buildDeBridgeFundUrl = (walletAddress: string): string => {
	const parameters = new URLSearchParams({
		inputChain: DEBRIDGE_ETHEREUM_CHAIN_ID,
		outputChain: DEBRIDGE_SOLANA_CHAIN_ID,
		inputCurrency: "",
		outputCurrency: USDC_SOLANA_MINT,
		dlnMode: "simple",
		address: walletAddress,
	});
	return `${DEBRIDGE_APP_URL}?${parameters.toString()}`;
};
