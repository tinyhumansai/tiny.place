import {
	agentLoginTokenIsFresh,
	decodeAgentLoginLink,
	sessionSignerFromAgentLoginToken,
	Signer,
	type AgentLoginToken,
	type BrowserSessionSigner,
	type Signer as SignerType,
	type TinyPlaceClient,
	type X25519KeyPair,
} from "@tinyhumansai/tinyplace";

/** Builds a client; pass the session signer to make authenticated calls. */
type ClientFactory = (signer?: SignerType) => TinyPlaceClient;

/**
 * A no-wallet session signer for the "view-as-agent" link flow.
 *
 * This is the Phantom-free sibling of `SessionWalletSigner`: instead of a
 * grantor `WalletSigner`, it carries the agent's identity public key (decoded
 * from the login-link token) and signs every request with the delegated session
 * key that the agent already approved and registered with the backend. The
 * backend's approved-signer delegation authorizes the session key to act as the
 * agent, so the human operates as the agent under a scoped, expiring, revocable
 * grant — with no Phantom and no private-key import.
 *
 * Like `SessionWalletSigner`, it reports the agent's cryptoId as {@link agentId}
 * (so the app keeps operating as the agent) while presenting the session public
 * key for signature verification, and exposes the agent identity key where an
 * identity proof is required ({@link identityPublicKeyBase64}).
 */
export class AgentSessionSigner extends Signer {
	/** The agent identity the session acts as (the link's grantor cryptoId). */
	public readonly agentId: string;
	/** The session key's public key — presented for signature verification. */
	public readonly publicKeyBase64: string;

	private readonly session: BrowserSessionSigner;
	private readonly token: AgentLoginToken;

	private constructor(session: BrowserSessionSigner, token: AgentLoginToken) {
		super();
		this.agentId = token.agentId;
		this.publicKeyBase64 = session.publicKeyBase64;
		this.session = session;
		this.token = token;
	}

	public sign(data: Uint8Array): Promise<Uint8Array> {
		// In-memory signature with the delegated session key — no wallet.
		return this.session.sign(data);
	}

	public getX25519KeyPair(): Promise<X25519KeyPair> {
		return this.session.getX25519KeyPair();
	}

	/** The session key (hex) — the backend's approved-signer lookup key. */
	public get sessionKey(): string {
		return this.token.signerKey;
	}

	/** RFC 3339 timestamp at which the session grant expires. */
	public get expiresAt(): string {
		return this.token.expiresAt;
	}

	/**
	 * The agent (grantor) public key — the key the backend has on record for the
	 * agent's identity. Distinct from {@link publicKeyBase64} (the session key):
	 * use this wherever a request must carry the identity's key, not the ephemeral
	 * session key that merely signs the request.
	 */
	public get identityPublicKeyBase64(): string {
		return this.token.grantorPublicKeyBase64;
	}

	/**
	 * x402 payment metadata binding a session-signed authorization to the agent's
	 * approved-signer grant. The backend verifies the signature against the
	 * session key and, seeing a non-empty `parentNonce`, authorizes it as the
	 * agent's delegate. (The default link grant carries a zero budget, so this
	 * only enables spending when the link was minted with an explicit budget.)
	 */
	public x402PaymentMetadata(): Record<string, string> {
		return {
			publicKey: this.publicKeyBase64,
			parentNonce: this.token.approvalNonce,
		};
	}

	/**
	 * Builds a signer from a `/auth/agent#<token>` fragment value, failing closed
	 * (returns undefined) for malformed, wrong-version, or expired tokens. The
	 * authoritative liveness check is {@link backendConfirmsActive}, which the
	 * caller must run before trusting the session.
	 */
	public static async fromFragment(
		fragment: string,
	): Promise<AgentSessionSigner | undefined> {
		const token = decodeAgentLoginLink(fragment);
		if (!token) return undefined;
		if (!agentLoginTokenIsFresh(token, Date.now())) return undefined;
		const session = await sessionSignerFromAgentLoginToken(token);
		// Defend against a tampered token whose seed does not match the advertised
		// signer key (which is what the backend grant is keyed by).
		if (session.publicKeyHex !== token.signerKey) return undefined;
		return new AgentSessionSigner(session, token);
	}

	/**
	 * Probes the backend for the grant's live status, signing the request with the
	 * session key itself. Returns true only when the grant is active — the
	 * delegation resolver authorizes the read only for active, unexpired grants,
	 * so a revoked/expired/exhausted grant yields false (via a thrown 403). The
	 * web app must fail closed on false.
	 */
	public async backendConfirmsActive(
		createClient: ClientFactory,
	): Promise<boolean> {
		try {
			const client: TinyPlaceClient = createClient(this);
			const signer = await client.signers.get(
				this.token.signerKey,
				this.agentId,
			);
			return signer.status === "active";
		} catch {
			return false;
		}
	}

	/**
	 * Claims the single-use link grant: the backend marks it consumed on the
	 * first call and rejects every replay (409), so a leaked link can be redeemed
	 * at most once. Signs the request with the session key (the link holder's
	 * credential). Returns true on the first successful claim, false if the link
	 * was already used / inactive — the route must fail closed on false.
	 */
	public async consumeLink(createClient: ClientFactory): Promise<boolean> {
		try {
			const client: TinyPlaceClient = createClient(this);
			await client.signers.consume(this.token.signerKey);
			return true;
		} catch {
			return false;
		}
	}
}

/** Why an agent-login link could not be restored. */
export type AgentLinkFailure = "malformed" | "expired" | "revoked" | "consumed";

/** The outcome of {@link restoreAgentLinkSession}. */
export type AgentLinkRestoreResult =
	| { ok: true; signer: AgentSessionSigner; agentId: string }
	| { ok: false; reason: AgentLinkFailure };

/** Options for {@link restoreAgentLinkSession}. */
export interface RestoreAgentLinkOptions {
	/**
	 * Consume the link as single-use (default true): the backend marks the grant
	 * consumed on first open and rejects replays, so a leaked link can be redeemed
	 * at most once. Set false only where single-use is not wanted.
	 */
	singleUse?: boolean;
}

/**
 * The pure core of the `/auth/agent` route: decode + validate the fragment,
 * reconstruct the no-wallet session signer, confirm the grant is active, and
 * (by default) consume it single-use. Returns a discriminated result so the
 * route can show a clear message and never enter a partial auth state.
 *
 * Failure modes (all fail closed, no signer leaked):
 *   - `malformed`: wrong version / bad shape / seed≠advertised signer key.
 *   - `expired`:   token TTL already elapsed (cheap client-side guard).
 *   - `revoked`:   backend reports the grant inactive (revoked/expired/exhausted)
 *                  or the liveness probe could not confirm it.
 *   - `consumed`:  the single-use link was already redeemed (replay blocked).
 */
export async function restoreAgentLinkSession(
	fragment: string,
	createClient: ClientFactory,
	options?: RestoreAgentLinkOptions,
): Promise<AgentLinkRestoreResult> {
	const token = decodeAgentLoginLink(fragment);
	if (!token) return { ok: false, reason: "malformed" };
	if (!agentLoginTokenIsFresh(token, Date.now())) {
		return { ok: false, reason: "expired" };
	}
	const signer = await AgentSessionSigner.fromFragment(fragment);
	if (!signer) return { ok: false, reason: "malformed" };
	if (!(await signer.backendConfirmsActive(createClient))) {
		return { ok: false, reason: "revoked" };
	}
	// Single-use: claim the link so it can't be replayed. A failed claim (already
	// used / inactive) fails closed.
	if (options?.singleUse !== false) {
		if (!(await signer.consumeLink(createClient))) {
			return { ok: false, reason: "consumed" };
		}
	}
	return { ok: true, signer, agentId: signer.agentId };
}
