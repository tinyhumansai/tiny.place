import {
	BrowserSessionSigner,
	clearSession as clearStoredSession,
	loadSession,
	saveSession,
	sessionIsFresh,
	Signer,
	SOLANA_MAINNET_NETWORK,
	type StoredSession,
	type TinyPlaceClient,
	type X25519KeyPair,
} from "@tinyhumansai/tinyplace";

import type { Transaction } from "@solana/web3.js";

import { WalletSigner } from "@src/common/wallet-signer";

type SignMessageFunction = (message: Uint8Array) => Promise<Uint8Array>;

/** The wallet adapter's transaction signer (Phantom can sign transactions, but
 * NOT via signMessage). Attached after the session is established so the
 * delegated-payment path can run the one-time on-chain spend approval. */
export type WalletSignTransaction = (
	transaction: Transaction
) => Promise<Transaction>;

/** Builds a client; pass the session signer to make authenticated calls. */
type ClientFactory = (signer?: Signer) => TinyPlaceClient;

// How long a session grant stays valid before the wallet must re-approve.
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
// x402 grant scope. The budget bounds *payments* only; non-payment auth
// (directory, messaging, groups, …) is gated solely by the grant being active
// and unexpired, so the session key can act as the wallet for everything.
const SESSION_ASSET = "USDC";
const SESSION_BUDGET = "100000000"; // 100 USDC in 6-decimal base units

/** The grant metadata needed to persist and reason about a session. */
interface SessionGrant {
	signerKey: string;
	approvalNonce: string;
	expiresAt: string;
	network: string;
	asset: string;
	budget: string;
	grantorPublicKeyBase64: string;
}

/**
 * A "hot session wallet" signer. The user's wallet (Phantom) approves a fresh
 * in-memory session key ONCE — an x402 "upto" grant registered with the backend
 * — and from then on this signer signs every request with the session key, in
 * memory, with no further wallet prompts. It reports the wallet's identity as
 * `agentId` (so the user keeps operating as their wallet) while presenting the
 * session public key for signature verification; the backend's approved-signer
 * delegation authorizes the session key to act as the wallet.
 *
 * The grant is persisted (see {@link restoreOrEstablish}) so a page reload
 * restores the session WITHOUT a wallet prompt, re-prompting only when the grant
 * has expired or the backend has marked it invalid (revoked / exhausted).
 *
 * Unlike {@link WalletSigner}, this also supports `getX25519KeyPair`, so Signal
 * end-to-end encryption works (an external wallet cannot expose its seed).
 */
export class SessionWalletSigner extends Signer {
	/** The wallet (grantor) identity the session acts as. */
	public readonly agentId: string;
	/** The session key's public key — presented for signature verification. */
	public readonly publicKeyBase64: string;
	/**
	 * The underlying wallet (grantor) signer. Its public key base58-derives to
	 * {@link agentId}, so it — not the session key — must sign acts that bind the
	 * cryptoId to the public key (identity registration), which the backend
	 * cannot accept under delegation. Routine, delegated calls keep using the
	 * session key via {@link sign}.
	 */
	public readonly walletSigner: WalletSigner;

	/**
	 * The wallet adapter's transaction signer, attached after construction (the
	 * grantor WalletSigner only does signMessage, which wallets refuse for
	 * transactions). Used to sign the one-time on-chain delegate-spend approval
	 * required by the PayAI settlement path. Undefined until the wallet provider
	 * attaches it.
	 */
	public walletSignTransaction?: WalletSignTransaction;

	private readonly session: BrowserSessionSigner;
	private readonly grant: SessionGrant;

	private constructor(
		grantor: WalletSigner,
		session: BrowserSessionSigner,
		grant: SessionGrant
	) {
		super();
		this.agentId = grantor.agentId;
		this.publicKeyBase64 = session.publicKeyBase64;
		this.walletSigner = grantor;
		this.session = session;
		this.grant = grant;
	}

	public sign(data: Uint8Array): Promise<Uint8Array> {
		// In-memory signature — no wallet round-trip.
		return this.session.sign(data);
	}

	public getX25519KeyPair(): Promise<X25519KeyPair> {
		return this.session.getX25519KeyPair();
	}

	/** The session key (hex) — the backend's approved-signer lookup key. */
	public get sessionKey(): string {
		return this.grant.signerKey;
	}

	/**
	 * x402 payment metadata that binds a session-signed authorization to the
	 * wallet's approved-signer grant. The backend verifies the signature against
	 * `publicKey` (the session key that actually signed) and, seeing a non-empty
	 * `parentNonce`, authorizes it as the wallet's delegate rather than requiring
	 * the signing key to base58-derive to the payer. Without this, a
	 * session-signed payment is rejected as "invalid signature".
	 */
	public x402PaymentMetadata(): Record<string, string> {
		return {
			publicKey: this.publicKeyBase64,
			parentNonce: this.grant.approvalNonce,
		};
	}

	/**
	 * The wallet (grantor) public key — the key the backend has on record for
	 * this wallet's registered identities. Distinct from {@link publicKeyBase64}
	 * (the session key): use this wherever a request must carry the *identity's*
	 * key (e.g. a marketplace buyer proving ownership of their @handle), not the
	 * ephemeral session key that merely signs the request.
	 */
	public get identityPublicKeyBase64(): string {
		return this.walletSigner.publicKeyBase64;
	}

	/** RFC 3339 timestamp at which the session grant expires. */
	public get expiresAt(): string {
		return this.grant.expiresAt;
	}

	/** Assembles the persistable record for this session. */
	private toStoredSession(): StoredSession {
		return {
			grantorAgentId: this.agentId,
			grantorPublicKeyBase64: this.grant.grantorPublicKeyBase64,
			signerKey: this.grant.signerKey,
			approvalNonce: this.grant.approvalNonce,
			expiresAt: this.grant.expiresAt,
			network: this.grant.network,
			asset: this.grant.asset,
			budget: this.grant.budget,
			keyPair: this.session.serialize().keyPair,
		};
	}

	/**
	 * Restores a persisted session for the wallet without a prompt, or — if none
	 * is stored, it has expired, or the backend reports it inactive — establishes
	 * a fresh one (the single wallet prompt) and persists it. This is the entry
	 * point the app should use; {@link establish} is the always-prompt fallback.
	 */
	public static async restoreOrEstablish(
		walletPublicKey: Uint8Array,
		walletSignMessage: SignMessageFunction,
		createClient: ClientFactory,
		approveSignMessage?: SignMessageFunction
	): Promise<SessionWalletSigner> {
		const grantor = new WalletSigner(walletPublicKey, walletSignMessage);
		const stored = await loadSession(grantor.agentId);

		if (stored && sessionIsFresh(stored, Date.now())) {
			const restored = SessionWalletSigner.fromStored(stored, grantor);
			if (await restored.backendConfirmsActive(createClient)) {
				return restored;
			}
			// Backend revoked/expired/exhausted the grant — drop it and re-establish.
			await clearStoredSession(grantor.agentId);
		} else if (stored) {
			await clearStoredSession(grantor.agentId);
		}

		const fresh = await SessionWalletSigner.establish(
			walletPublicKey,
			walletSignMessage,
			createClient(),
			approveSignMessage
		);
		await saveSession(fresh.toStoredSession());
		return fresh;
	}

	/**
	 * Probes the backend for this session's live status, signing the request with
	 * the session key itself. Returns true only when the grant is still active —
	 * the delegation resolver authorizes the read only for active, unexpired
	 * grants, so a revoked/expired session yields false (via a thrown 403).
	 */
	private async backendConfirmsActive(
		createClient: ClientFactory
	): Promise<boolean> {
		try {
			const client = createClient(this);
			const signer = await client.signers.get(
				this.grant.signerKey,
				this.agentId
			);
			return signer.status === "active";
		} catch {
			return false;
		}
	}

	/** Rebuilds a signer from a persisted record — no prompt, no new grant. */
	private static fromStored(
		stored: StoredSession,
		grantor: WalletSigner
	): SessionWalletSigner {
		const session = BrowserSessionSigner.fromStored(
			stored.keyPair,
			stored.approvalNonce
		);
		return new SessionWalletSigner(grantor, session, {
			signerKey: stored.signerKey,
			approvalNonce: stored.approvalNonce,
			expiresAt: stored.expiresAt,
			network: stored.network,
			asset: stored.asset,
			budget: stored.budget,
			grantorPublicKeyBase64: stored.grantorPublicKeyBase64,
		});
	}

	/**
	 * Establishes a session: prompts the wallet a SINGLE time to approve a fresh
	 * in-memory session key, registers the grant with the backend, and returns a
	 * signer that uses the session key for everything thereafter.
	 *
	 * The one-time approval is signed through {@link approveSignMessage} when
	 * provided — the wallet-context wires this to the "Approve browser session"
	 * confirmation dialog. The persisted grantor/identity signer is built from the
	 * RAW `walletSignMessage`, so later acts the backend cannot delegate (identity
	 * registration, x402 payments) prompt the wallet directly instead of
	 * re-rendering the session-approval dialog every time.
	 */
	public static async establish(
		walletPublicKey: Uint8Array,
		walletSignMessage: SignMessageFunction,
		client: TinyPlaceClient,
		approveSignMessage?: SignMessageFunction
	): Promise<SessionWalletSigner> {
		const grantor = new WalletSigner(walletPublicKey, walletSignMessage);
		// Same wallet key, but routes the single approval signature through the
		// session-approval dialog; falls back to the grantor when no dialog signer
		// is supplied (e.g. the always-prompt fallback path).
		const approver = approveSignMessage
			? new WalletSigner(walletPublicKey, approveSignMessage)
			: grantor;
		const session = await BrowserSessionSigner.create();
		const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

		// The one and only wallet prompt: sign the "upto" grant that approves the
		// session key up to a budget and expiry.
		const approval = await session.buildApprovalRequest(
			approver,
			grantor.agentId,
			{
				network: SOLANA_MAINNET_NETWORK,
				asset: SESSION_ASSET,
				budget: SESSION_BUDGET,
				expiresAt,
				// Bind the grant to the wallet so an unregistered wallet still works.
				grantorPublicKey: grantor.publicKeyBase64,
			}
		);

		// Register the grant so the backend recognizes the session key as a
		// delegate that can act as the wallet.
		await client.signers.approve(approval.authorization);

		const approvalNonce = session.getApprovalNonce();
		if (!approvalNonce) {
			throw new Error("session grant missing approval nonce");
		}

		return new SessionWalletSigner(grantor, session, {
			signerKey: session.publicKeyHex,
			approvalNonce,
			// buildApprovalRequest strips fractional seconds before signing; persist
			// the same whole-second expiry the grant was actually signed with.
			expiresAt: approval.authorization.expiresAt,
			network: SOLANA_MAINNET_NETWORK,
			asset: SESSION_ASSET,
			budget: SESSION_BUDGET,
			grantorPublicKeyBase64: grantor.publicKeyBase64,
		});
	}
}
