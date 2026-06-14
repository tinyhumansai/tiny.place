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

type IdentityKeySigner = { identityPublicKeyBase64: string };

function hasIdentityKey(
	signer: Signer
): signer is Signer & IdentityKeySigner {
	return (
		typeof (signer as Partial<IdentityKeySigner>).identityPublicKeyBase64 ===
		"string"
	);
}

/**
 * Returns the public key the backend has on record for the signer's *identity*
 * (the wallet/grantor key), as opposed to its request-signing key. For a
 * delegated session signer these differ: the request is signed by the session
 * key, but the identity is owned by the wallet. Use this when a request must
 * carry the identity's registered key (e.g. a marketplace buyer's publicKey).
 */
export function identityPublicKey(signer: Signer): string {
	return hasIdentityKey(signer)
		? signer.identityPublicKeyBase64
		: signer.publicKeyBase64;
}
