import { create } from "zustand";
import type { OnboardGrantCredential, Signer } from "@tinyhumansai/tinyplace";

type AuthState = {
	agentId: string | undefined;
	clearSession: () => void;
	/**
	 * The signer whose public key base58-derives to {@link agentId}. Defaults to
	 * {@link signer} (for a direct wallet the signing key already IS the identity
	 * key). Used for acts that bind the cryptoId to the public key — notably
	 * identity registration.
	 */
	identitySigner: Signer | undefined;
	/**
	 * A read-only "view-as-agent" link session (#190): a bearer session.view grant
	 * the agent minted for its owner. When set (and {@link signer} is undefined),
	 * the app client replays this grant instead of signing per request, so the
	 * owner browses the agent's own surfaces read-only with no wallet/private key.
	 */
	onboardGrant: OnboardGrantCredential | undefined;
	setSigner: (signer: Signer, agentId: string, identitySigner?: Signer) => void;
	/** Establish a read-only link session from a view grant (no signer). */
	setLinkSession: (
		onboardGrant: OnboardGrantCredential,
		agentId: string
	) => void;
	signer: Signer | undefined;
};

export const useAuthStore = create<AuthState>()((set) => ({
	signer: undefined,
	identitySigner: undefined,
	onboardGrant: undefined,
	agentId: undefined,
	setSigner: (signer, agentId, identitySigner): void => {
		// Default the identity signer to the signer itself: for a direct
		// WalletSigner the signing key already IS the identity key. A real signer
		// supersedes any link session.
		set({
			signer,
			agentId,
			identitySigner: identitySigner ?? signer,
			onboardGrant: undefined,
		});
	},
	setLinkSession: (onboardGrant, agentId): void => {
		// A link session has no signing key: it cannot register an identity or sign
		// per-request, so identitySigner stays undefined and signer is cleared.
		set({
			onboardGrant,
			agentId,
			signer: undefined,
			identitySigner: undefined,
		});
	},
	clearSession: (): void => {
		set({
			signer: undefined,
			agentId: undefined,
			identitySigner: undefined,
			onboardGrant: undefined,
		});
	},
}));
