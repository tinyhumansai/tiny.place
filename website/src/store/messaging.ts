import { create } from "zustand";
import type { SignalSession, TinyPlaceClient } from "@tinyhumansai/tinyplace";

import type { SignalIdentity } from "@src/common/signal-identity";
import {
	createEncryptionClient,
	createSession,
} from "@src/common/signal-messaging";

type MessagingState = {
	/** Messaging address (derived encryption pubkey) the client/session is bound to. */
	address: string | undefined;
	/** Client authenticated with the encryption identity (owns /keys + /messages). */
	encryptionClient: TinyPlaceClient | undefined;
	/** Long-lived Signal session bound to the identity's persistent store. */
	session: SignalSession | undefined;
	/** Whether the key bundle has been published to the relay this session. */
	bundlePublished: boolean;
	/** Whether the encryption key has been advertised on the directory card. */
	keyAdvertised: boolean;
	/** Builds the encryption client and session from a ready identity. */
	setup: (identity: SignalIdentity) => void;
	markBundlePublished: () => void;
	markKeyAdvertised: () => void;
	/** Tears down the messaging clients (e.g. on wallet disconnect). */
	reset: () => void;
};

export const useMessagingStore = create<MessagingState>()((set) => ({
	address: undefined,
	encryptionClient: undefined,
	session: undefined,
	bundlePublished: false,
	keyAdvertised: false,
	setup: (identity): void => {
		set({
			address: identity.signer.publicKeyBase64,
			encryptionClient: createEncryptionClient(identity),
			session: createSession(identity),
			bundlePublished: false,
			keyAdvertised: false,
		});
	},
	markBundlePublished: (): void => {
		set({ bundlePublished: true });
	},
	markKeyAdvertised: (): void => {
		set({ keyAdvertised: true });
	},
	reset: (): void => {
		set({
			address: undefined,
			encryptionClient: undefined,
			session: undefined,
			bundlePublished: false,
			keyAdvertised: false,
		});
	},
}));
