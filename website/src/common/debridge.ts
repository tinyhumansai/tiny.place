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

// deBridge represents native SOL (not an SPL token) by the all-ones / 32-zero-byte
// address, the same convention it uses for native gas tokens on every chain.
export const SOL_NATIVE_SOLANA = "11111111111111111111111111111111";

/**
 * Builds a deBridge deep link that bridges crypto from Ethereum into the chosen
 * asset on the given Solana wallet (USDC by default, or native SOL). Returns an
 * `app.debridge.com` URL safe to open in a new tab. The input chain/token and
 * amount are left for the user to choose on deBridge.
 */
export const buildDeBridgeFundUrl = (
	walletAddress: string,
	outputCurrency: string = USDC_SOLANA_MINT
): string => {
	const parameters = new URLSearchParams({
		inputChain: DEBRIDGE_ETHEREUM_CHAIN_ID,
		outputChain: DEBRIDGE_SOLANA_CHAIN_ID,
		inputCurrency: "",
		outputCurrency,
		dlnMode: "simple",
		address: walletAddress,
	});
	return `${DEBRIDGE_APP_URL}?${parameters.toString()}`;
};
