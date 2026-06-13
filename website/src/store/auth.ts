import { create } from "zustand";
import type { Signer } from "@tinyhumansai/tinyplace";

type AuthState = {
	agentId: string | undefined;
	clearSession: () => void;
	/**
	 * The signer whose public key base58-derives to {@link agentId}. For a hot
	 * session wallet this is the underlying wallet (grantor), NOT the session
	 * key. Use it for acts the backend cannot accept under delegation — notably
	 * identity registration, which binds the cryptoId to the public key.
	 */
	identitySigner: Signer | undefined;
	setSigner: (
		signer: Signer,
		agentId: string,
		identitySigner?: Signer
	) => void;
	signer: Signer | undefined;
};

export const useAuthStore = create<AuthState>()((set) => ({
	signer: undefined,
	identitySigner: undefined,
	agentId: undefined,
	setSigner: (signer, agentId, identitySigner): void => {
		// Default the identity signer to the signer itself: for a direct
		// WalletSigner the signing key already IS the identity key.
		set({ signer, agentId, identitySigner: identitySigner ?? signer });
	},
	clearSession: (): void => {
		set({ signer: undefined, agentId: undefined, identitySigner: undefined });
	},
}));
