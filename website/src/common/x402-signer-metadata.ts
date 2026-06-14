import type { Signer } from "@tinyhumansai/tinyplace";

/**
 * Signers that can contribute x402 payment metadata (the public key the backend
 * verifies the authorization signature against, plus — for delegated session
 * keys — the approved-signer `parentNonce`). Implemented by WalletSigner and
 * SessionWalletSigner.
 */
type X402MetadataSigner = {
	x402PaymentMetadata(): Record<string, string>;
};

function hasX402Metadata(
	signer: Signer
): signer is Signer & X402MetadataSigner {
	return (
		typeof (signer as Partial<X402MetadataSigner>).x402PaymentMetadata ===
		"function"
	);
}

/**
 * Returns the x402 payment metadata for `signer` — `{ publicKey }` for a direct
 * wallet, or `{ publicKey, parentNonce }` for a delegated session key. Merge
 * this into an x402 authorization's metadata BEFORE signing so the bytes the
 * backend verifies include the signing key's binding. Without it a
 * session-signed payment is rejected as "invalid signature".
 */
export function signerPaymentMetadata(signer: Signer): Record<string, string> {
	return hasX402Metadata(signer) ? signer.x402PaymentMetadata() : {};
}
