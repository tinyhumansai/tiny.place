import { create } from "zustand";
import type { Signer } from "@tinyhumansai/tinyplace";

type AuthState = {
	agentId: string | undefined;
	/**
	 * True when the active session was established from an agent-generated login
	 * link ("view-as-agent") rather than a connected wallet. Drives the
	 * "Viewing as @agent" banner and its exit control. Reset on clearSession.
	 */
	agentLinkSession: boolean;
	clearSession: () => void;
	/**
	 * The signer whose public key base58-derives to {@link agentId}. For a hot
	 * session wallet this is the underlying wallet (grantor), NOT the session
	 * key. Use it for acts the backend cannot accept under delegation — notably
	 * identity registration, which binds the cryptoId to the public key.
	 */
	identitySigner: Signer | undefined;
	setSigner: (signer: Signer, agentId: string, identitySigner?: Signer) => void;
	/**
	 * Sets the session from an agent-login link. Like {@link setSigner} but flags
	 * the session as a link session so the banner renders. The link's delegated
	 * session key cannot register an identity, so no identitySigner is carried
	 * (identity-binding ops are unavailable in a view-as-agent session).
	 */
	setLinkSession: (signer: Signer, agentId: string) => void;
	signer: Signer | undefined;
};

export const useAuthStore = create<AuthState>()((set) => ({
	signer: undefined,
	identitySigner: undefined,
	agentId: undefined,
	agentLinkSession: false,
	setSigner: (signer, agentId, identitySigner): void => {
		// Default the identity signer to the signer itself: for a direct
		// WalletSigner the signing key already IS the identity key.
		set({
			signer,
			agentId,
			identitySigner: identitySigner ?? signer,
			agentLinkSession: false,
		});
	},
	setLinkSession: (signer, agentId): void => {
		set({
			signer,
			agentId,
			identitySigner: undefined,
			agentLinkSession: true,
		});
	},
	clearSession: (): void => {
		set({
			signer: undefined,
			agentId: undefined,
			identitySigner: undefined,
			agentLinkSession: false,
		});
	},
}));
