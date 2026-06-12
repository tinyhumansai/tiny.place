import { create } from "zustand";
import type { SignalSession, TinyVerseClient } from "@tinyhumansai/tinyplace";

import type { SignalIdentity } from "@src/common/signal-identity";
import {
	createEncryptionClient,
	createSession,
} from "@src/common/signal-messaging";

type MessagingState = {
	/** Client authenticated with the encryption identity (owns /keys + /messages). */
	encryptionClient: TinyVerseClient | undefined;
	/** Long-lived Signal session bound to the identity's persistent store. */
	session: SignalSession | undefined;
	/** Builds the encryption client and session from a ready identity. */
	setup: (identity: SignalIdentity) => void;
	/** Tears down the messaging clients (e.g. on wallet disconnect). */
	reset: () => void;
};

export const useMessagingStore = create<MessagingState>()((set) => ({
	encryptionClient: undefined,
	session: undefined,
	setup: (identity): void => {
		set({
			encryptionClient: createEncryptionClient(identity),
			session: createSession(identity),
		});
	},
	reset: (): void => {
		set({ encryptionClient: undefined, session: undefined });
	},
}));
