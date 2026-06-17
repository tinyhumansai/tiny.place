import { create } from "zustand";

import {
	loadOrCreateSignalIdentity,
	type SignalIdentity,
} from "@src/common/signal-identity";

type SignMessageFunction = (message: Uint8Array) => Promise<Uint8Array>;

export type SignalStatus = "idle" | "loading" | "ready" | "error";

type SignalState = {
	status: SignalStatus;
	identity: SignalIdentity | undefined;
	/** The wallet agent id the current identity was derived for. */
	agentId: string | undefined;
	error: string | undefined;
	/**
	 * Derives (first use) or loads the wallet's encryption identity. Idempotent
	 * while loading/ready for the *same* wallet; re-derives when the wallet agent
	 * changes so a different user never reuses the previous identity.
	 */
	enable: (
		walletAgentId: string,
		signMessage: SignMessageFunction
	) => Promise<void>;
	/**
	 * Flags a post-derivation failure (e.g. the key bundle never reached the
	 * relay) as an error without discarding the derived identity, so the next
	 * enable() can retry the publish. Surfaces the message through `error`.
	 */
	setPublishError: (message: string) => void;
	/** Clears the in-memory identity (e.g. on wallet disconnect). */
	reset: () => void;
};

export const useSignalStore = create<SignalState>()((set, get) => ({
	status: "idle",
	identity: undefined,
	agentId: undefined,
	error: undefined,
	enable: async (walletAgentId, signMessage): Promise<void> => {
		const { status, agentId } = get();
		if (
			(status === "loading" || status === "ready") &&
			agentId === walletAgentId
		) {
			return;
		}
		set({ status: "loading", error: undefined });
		try {
			const identity = await loadOrCreateSignalIdentity(
				walletAgentId,
				signMessage
			);
			set({ status: "ready", identity, agentId: walletAgentId });
		} catch (error) {
			set({
				status: "error",
				error: error instanceof Error ? error.message : "Unknown error",
			});
		}
	},
	setPublishError: (message): void => {
		// Keep `identity`/`agentId` so the next enable() reloads from IndexedDB
		// (no fresh signature) and retries the publish; only flip status to error.
		set({ status: "error", error: message });
	},
	reset: (): void => {
		set({
			status: "idle",
			identity: undefined,
			agentId: undefined,
			error: undefined,
		});
	},
}));
