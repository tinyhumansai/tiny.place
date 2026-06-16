import {
	generateNonce,
	signX402Authorization,
	signerPaymentMetadata,
	x402AuthorizationToPaymentMap,
	type Signer,
	type TinyPlaceClient,
	type X402Authorization,
	type X402AuthorizationFields,
} from "@tinyhumansai/tinyplace";

import { createClient } from "@src/common/api-client";
import {
	buildDelegatedTxForPaymentMap,
	enableDelegatedSpending,
	payViaSessionDelegate,
	X402_DELEGATED_TX_METADATA_KEY,
	type SessionPaymentOptions,
} from "@src/common/session-payments";
import { SessionWalletSigner } from "@src/common/session-wallet";
import { WalletSigner } from "@src/common/wallet-signer";
import {
	assertValidX402Challenge,
	type ExpectedX402Payment,
} from "@src/common/x402-challenge";
import { useAuthStore } from "@src/store/auth";

export type X402ChallengePayment = Omit<
	X402AuthorizationFields,
	"expiresAt" | "nonce"
> &
	Partial<Pick<X402AuthorizationFields, "expiresAt" | "nonce">>;

export type AuthSession = {
	agentId: string;
	identitySigner: Signer;
	signer: Signer;
};

export type X402PaymentSigningOptions = {
	expected?: ExpectedX402Payment;
	expiresInMs?: number;
	fallbackFrom: string;
	metadata?: Record<string, string>;
	noncePrefix: string;
	payment: X402ChallengePayment;
	signer?: Signer;
};

const DEFAULT_PAYMENT_EXPIRY_MS = 5 * 60 * 1000;

export { enableDelegatedSpending, payViaSessionDelegate };
export { SessionWalletSigner, WalletSigner };
export type { SessionPaymentOptions };

export function currentAuthSession(): AuthSession | undefined {
	const { agentId, identitySigner, signer } = useAuthStore.getState();
	if (!agentId || !signer || !identitySigner) {
		return undefined;
	}
	return { agentId, identitySigner, signer };
}

export function requireAuthSession(): AuthSession {
	const session = currentAuthSession();
	if (!session) {
		throw new Error("Connect your wallet first");
	}
	return session;
}

export function setAuthSession(signer: Signer, identity?: Signer): void {
	useAuthStore.getState().setSigner(signer, signer.agentId, identity);
}

export function createAuthenticatedClient(
	signer?: Signer,
	onAuthInvalid?: (status: number, body: unknown) => void
): TinyPlaceClient {
	return createClient(signer ?? currentAuthSession()?.signer, onAuthInvalid);
}

export function createIdentityClient(): TinyPlaceClient {
	return createClient(currentAuthSession()?.identitySigner);
}

export function identitySigner(): Signer | undefined {
	return currentAuthSession()?.identitySigner;
}

export function sessionSigner(): Signer | undefined {
	return currentAuthSession()?.signer;
}

export async function signX402ChallengeAuthorization({
	expected,
	expiresInMs = DEFAULT_PAYMENT_EXPIRY_MS,
	fallbackFrom,
	metadata,
	noncePrefix,
	payment,
	signer = requireAuthSession().signer,
}: X402PaymentSigningOptions): Promise<X402Authorization> {
	assertValidX402Challenge(payment, expected);
	return signX402Authorization(signer, {
		...payment,
		expiresAt:
			payment.expiresAt ?? new Date(Date.now() + expiresInMs).toISOString(),
		from: payment.from || fallbackFrom,
		metadata: {
			...payment.metadata,
			...signerPaymentMetadata(signer),
			...metadata,
		},
		nonce: payment.nonce || generateNonce(noncePrefix),
	});
}

export async function signX402ChallengePaymentMap(
	options: X402PaymentSigningOptions
): Promise<Record<string, string>> {
	const signer = options.signer ?? requireAuthSession().signer;
	const signedPayment = await signX402ChallengeAuthorization({
		...options,
		signer,
	});
	const payment = x402AuthorizationToPaymentMap(signedPayment);

	// Delegate the spend so the PAYER's own funds move (the facilitator only
	// fee-pays), instead of the backend custodially fronting them. Carried as
	// metadata.delegatedTx; the backend routes any payment bearing it to the
	// delegated settler. Only session wallets can do this; other signers and
	// non-delegatable payments keep the existing path.
	if (signer instanceof SessionWalletSigner) {
		const delegatedTx = await buildDelegatedTxForPaymentMap(signer, {
			amount: payment["amount"] ?? "",
			asset: payment["asset"],
			from: payment["from"] ?? "",
			network: payment["network"],
			to: payment["to"] ?? "",
		});
		if (delegatedTx) {
			payment[`metadata.${X402_DELEGATED_TX_METADATA_KEY}`] = delegatedTx;
		}
	}
	return payment;
}
