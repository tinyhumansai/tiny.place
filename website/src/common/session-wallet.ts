import {
	BrowserSessionSigner,
	Signer,
	SOLANA_MAINNET_NETWORK,
	type TinyVerseClient,
	type X25519KeyPair,
} from "@tinyhumansai/tinyplace";

import { WalletSigner } from "@src/common/wallet-signer";

type SignMessageFunction = (message: Uint8Array) => Promise<Uint8Array>;

// How long a session grant stays valid before the wallet must re-approve.
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
// x402 grant scope. The budget bounds *payments* only; non-payment auth
// (directory, messaging, groups, …) is gated solely by the grant being active
// and unexpired, so the session key can act as the wallet for everything.
const SESSION_ASSET = "SOL";
const SESSION_BUDGET = "1000000000"; // 1 SOL in lamports

/**
 * A "hot session wallet" signer. The user's wallet (Phantom) approves a fresh
 * in-memory session key ONCE — an x402 "upto" grant registered with the backend
 * — and from then on this signer signs every request with the session key, in
 * memory, with no further wallet prompts. It reports the wallet's identity as
 * `agentId` (so the user keeps operating as their wallet) while presenting the
 * session public key for signature verification; the backend's approved-signer
 * delegation authorizes the session key to act as the wallet.
 *
 * Unlike {@link WalletSigner}, this also supports `getX25519KeyPair`, so Signal
 * end-to-end encryption works (an external wallet cannot expose its seed).
 */
export class SessionWalletSigner extends Signer {
	/** The wallet (grantor) identity the session acts as. */
	public readonly agentId: string;
	/** The session key's public key — presented for signature verification. */
	public readonly publicKeyBase64: string;

	private readonly session: BrowserSessionSigner;

	private constructor(grantorAgentId: string, session: BrowserSessionSigner) {
		super();
		this.agentId = grantorAgentId;
		this.publicKeyBase64 = session.publicKeyBase64;
		this.session = session;
	}

	public sign(data: Uint8Array): Promise<Uint8Array> {
		// In-memory signature — no wallet round-trip.
		return this.session.sign(data);
	}

	public getX25519KeyPair(): Promise<X25519KeyPair> {
		return this.session.getX25519KeyPair();
	}

	/**
	 * Establishes a session: prompts the wallet a SINGLE time to approve a fresh
	 * in-memory session key, registers the grant with the backend, and returns a
	 * signer that uses the session key for everything thereafter.
	 */
	public static async establish(
		walletPublicKey: Uint8Array,
		walletSignMessage: SignMessageFunction,
		client: TinyVerseClient
	): Promise<SessionWalletSigner> {
		const grantor = new WalletSigner(walletPublicKey, walletSignMessage);
		const session = await BrowserSessionSigner.create();
		const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

		// The one and only wallet prompt: sign the "upto" grant that approves the
		// session key up to a budget and expiry.
		const approval = await session.buildApprovalRequest(
			grantor,
			grantor.agentId,
			{
				network: SOLANA_MAINNET_NETWORK,
				asset: SESSION_ASSET,
				budget: SESSION_BUDGET,
				expiresAt,
			}
		);

		// Register the grant so the backend recognizes the session key as a
		// delegate that can act as the wallet.
		await client.signers.approve(approval.authorization);

		return new SessionWalletSigner(grantor.agentId, session);
	}
}
