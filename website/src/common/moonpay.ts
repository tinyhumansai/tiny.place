// MoonPay on-ramp / off-ramp configuration.
//
// The publishable API key is safe to expose to the browser (it only unlocks the
// widget, not any settlement authority). It is inlined at build time via the
// `NEXT_PUBLIC_*` convention and falls back to MoonPay's shared sandbox test key
// so the widget renders out of the box in local/dev environments.
export const MOONPAY_API_KEY =
	process.env["NEXT_PUBLIC_MOONPAY_API_KEY"] ??
	"pk_test_oPfe89bYFJ6NJqrxXrZ4srpDInxvicu";

// MoonPay's currency code for USDC on the Solana network. Buys/sells through the
// widget therefore settle to/from the user's SOL wallet in USDC.
export const MOONPAY_USDC_SOLANA_CURRENCY_CODE = "usdc_sol";

// Fiat the widget quotes against by default.
export const MOONPAY_BASE_CURRENCY_CODE = "usd";

// Test (sandbox) keys are served by the sandbox host; live keys by production.
const MOONPAY_BUY_HOST = MOONPAY_API_KEY.startsWith("pk_test")
	? "https://buy-sandbox.moonpay.com"
	: "https://buy.moonpay.com";

type MoonPayBuyOptions = {
	walletAddress?: string;
	baseCurrencyAmount?: string;
};

/**
 * Builds a MoonPay hosted buy-widget URL for funding a SOL wallet with USDC via
 * a fiat card payment. Returned as a plain link suitable for a redirect button.
 *
 * Note: this is an unsigned URL. It works as long as the MoonPay account does
 * not enforce URL signing; if signing is enabled, the `walletAddress` must be
 * HMAC-signed server-side with the secret key (which never ships to the
 * browser).
 */
export const buildMoonPayBuyUrl = ({
	walletAddress,
	baseCurrencyAmount,
}: MoonPayBuyOptions): string => {
	const parameters = new URLSearchParams({
		apiKey: MOONPAY_API_KEY,
		defaultCurrencyCode: MOONPAY_USDC_SOLANA_CURRENCY_CODE,
		baseCurrencyCode: MOONPAY_BASE_CURRENCY_CODE,
	});
	if (walletAddress !== undefined && walletAddress !== "") {
		parameters.set("walletAddress", walletAddress);
	}
	if (baseCurrencyAmount !== undefined && baseCurrencyAmount !== "") {
		parameters.set("baseCurrencyAmount", baseCurrencyAmount);
	}
	return `${MOONPAY_BUY_HOST}?${parameters.toString()}`;
};
