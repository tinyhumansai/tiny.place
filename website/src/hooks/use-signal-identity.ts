"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useCallback, useEffect } from "react";

import { useApiClient } from "@src/common/api-context";
import { publishEncryptionKey } from "@src/common/encryption-discovery";
import {
	hasSignalIdentity,
	type SignalIdentity,
} from "@src/common/signal-identity";
import {
	publishKeyBundle,
	verifyKeyBundlePublished,
} from "@src/common/signal-messaging";
import { useAuthStore } from "@src/store/auth";
import { useConversationsStore } from "@src/store/conversations";
import { useGroupConversationsStore } from "@src/store/group-conversations";
import { useMessagingStore } from "@src/store/messaging";
import { useSignalStore, type SignalStatus } from "@src/store/signal";

type UseSignalIdentityResult = {
	status: SignalStatus;
	identity: SignalIdentity | undefined;
	error: string | undefined;
	/** True once the encryption identity is derived and ready to use. */
	isReady: boolean;
	/** True while the wallet is connected and can derive an identity. */
	canEnable: boolean;
	/**
	 * Derives or loads the encryption identity for the connected wallet. Prompts
	 * for a wallet signature only on first use; subsequent calls load from
	 * IndexedDB. Resolves to the identity, or `undefined` if no wallet/signer.
	 */
	enable: () => Promise<SignalIdentity | undefined>;
};

/**
 * Manages the wallet's end-to-end encryption identity (separate from the wallet
 * auth signer). Resets the identity automatically when the wallet disconnects.
 */
export function useSignalIdentity(): UseSignalIdentityResult {
	const { connected, signMessage } = useWallet();
	const walletClient = useApiClient();
	const agentId = useAuthStore((state) => state.agentId);
	const status = useSignalStore((state) => state.status);
	const identity = useSignalStore((state) => state.identity);
	const error = useSignalStore((state) => state.error);
	const enableIdentity = useSignalStore((state) => state.enable);
	const setPublishError = useSignalStore((state) => state.setPublishError);
	const reset = useSignalStore((state) => state.reset);
	const bundleVerified = useMessagingStore((state) => state.bundleVerified);
	const setupMessaging = useMessagingStore((state) => state.setup);
	const resetMessaging = useMessagingStore((state) => state.reset);
	const ensureConversationsOwner = useConversationsStore(
		(state) => state.ensureOwner
	);
	const ensureGroupConversationsOwner = useGroupConversationsStore(
		(state) => state.ensureOwner
	);

	useEffect(() => {
		if (!connected) {
			// Drop the in-memory identity/client on disconnect, but keep persisted
			// conversations: they're rescoped on the next enable() via ensureOwner,
			// so reconnecting the same wallet restores its history.
			reset();
			resetMessaging();
		}
	}, [connected, reset, resetMessaging]);

	const canEnable = connected && Boolean(signMessage) && Boolean(agentId);

	const enable = useCallback(async (): Promise<SignalIdentity | undefined> => {
		if (!agentId || !signMessage) {
			return undefined;
		}
		await enableIdentity(agentId, signMessage);
		const readyIdentity = useSignalStore.getState().identity;
		if (!readyIdentity) {
			return undefined;
		}

		// Scope persisted conversations to this identity. ensureOwner clears them
		// only when a *different* wallet's history was rehydrated from storage, so
		// reloading the same wallet keeps its threads.
		const address = readyIdentity.signer.publicKeyBase64;
		ensureConversationsOwner(address);
		ensureGroupConversationsOwner(address);

		// (Re)build the messaging client + session when the active identity changes
		// (first enable, a wallet/agent switch, or a fresh page load — the client is
		// in-memory and not persisted).
		if (useMessagingStore.getState().address !== address) {
			setupMessaging(readyIdentity);
		}

		const encryptionClient = useMessagingStore.getState().encryptionClient;
		if (!encryptionClient) {
			return undefined;
		}

		// Publish the key bundle, advertise the encryption key, then PROBE the relay
		// to confirm the bundle is actually fetchable. Each step is tracked so a retry
		// resumes where it failed. A failure here is propagated into the error state
		// (not swallowed) and we return undefined, so "ready" can never mean
		// "published but unreachable for DMs". The visible error + the enable button
		// give the user a retry affordance.
		if (!useMessagingStore.getState().bundleVerified) {
			try {
				if (!useMessagingStore.getState().bundlePublished) {
					await publishKeyBundle(encryptionClient);
					useMessagingStore.getState().markBundlePublished();
				}
				if (!useMessagingStore.getState().keyAdvertised) {
					await publishEncryptionKey(walletClient, agentId, address);
					useMessagingStore.getState().markKeyAdvertised();
				}
				await verifyKeyBundlePublished(encryptionClient, address);
				useMessagingStore.getState().markBundleVerified();
			} catch (publishError) {
				const message =
					publishError instanceof Error
						? publishError.message
						: "Unknown error";
				// Surface to telemetry and the user instead of silently succeeding.
				console.error("Failed to publish messaging key bundle:", publishError);
				// Clear publish/advertise progress so a retry re-publishes: if the
				// verification probe failed, the bundle may not be on the relay, and
				// skipping straight to verify again would re-fail forever.
				useMessagingStore.getState().clearPublishProgress();
				setPublishError(
					`Messaging not reachable — key publish failed: ${message}`
				);
				return undefined;
			}
		}

		return readyIdentity;
	}, [
		agentId,
		signMessage,
		enableIdentity,
		setupMessaging,
		ensureConversationsOwner,
		ensureGroupConversationsOwner,
		setPublishError,
		walletClient,
	]);

	// Auto-restore encryption on load when this wallet already has a derived
	// identity persisted in IndexedDB. The stored seed is reused, so no wallet
	// signature is prompted — the user no longer has to click "Enable encryption"
	// on every visit.
	useEffect(() => {
		if (!canEnable || status !== "idle" || !agentId) {
			return;
		}
		let cancelled = false;
		void (async (): Promise<void> => {
			try {
				const exists = await hasSignalIdentity(agentId);
				if (
					!cancelled &&
					exists &&
					useSignalStore.getState().status === "idle"
				) {
					await enable();
				}
			} catch {
				// Best-effort restore; the manual "Enable encryption" button remains.
			}
		})();
		return (): void => {
			cancelled = true;
		};
	}, [canEnable, status, agentId, enable]);

	return {
		status,
		identity,
		error,
		// "ready" requires a confirmed, fetchable bundle — a derived identity whose
		// bundle never landed on the relay is unreachable, not ready.
		isReady: status === "ready" && bundleVerified,
		canEnable,
		enable,
	};
}
