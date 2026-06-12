"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useCallback, useEffect } from "react";

import { useApiClient } from "@src/common/api-context";
import { publishEncryptionKey } from "@src/common/encryption-discovery";
import type { SignalIdentity } from "@src/common/signal-identity";
import { publishKeyBundle } from "@src/common/signal-messaging";
import { useAuthStore } from "@src/store/auth";
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
	const reset = useSignalStore((state) => state.reset);
	const setupMessaging = useMessagingStore((state) => state.setup);
	const resetMessaging = useMessagingStore((state) => state.reset);

	useEffect(() => {
		if (!connected) {
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

		// Bring messaging online once per identity: build the encryption client +
		// session, publish the key bundle, and advertise the encryption key on the
		// directory card. Publishing is best-effort so a transient failure does not
		// invalidate the derived identity.
		if (!useMessagingStore.getState().session) {
			setupMessaging(readyIdentity);
			const encryptionClient = useMessagingStore.getState().encryptionClient;
			if (encryptionClient) {
				try {
					await publishKeyBundle(encryptionClient, readyIdentity);
				} catch (publishError) {
					console.warn("Failed to publish key bundle:", publishError);
				}
				try {
					await publishEncryptionKey(
						walletClient,
						agentId,
						readyIdentity.signer.publicKeyBase64
					);
				} catch (advertiseError) {
					console.warn("Failed to advertise encryption key:", advertiseError);
				}
			}
		}

		return readyIdentity;
	}, [agentId, signMessage, enableIdentity, setupMessaging, walletClient]);

	return {
		status,
		identity,
		error,
		isReady: status === "ready",
		canEnable,
		enable,
	};
}
