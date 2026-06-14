"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { useApiClient } from "@src/common/api-context";
import { resolveEncryptionAddress } from "@src/common/encryption-discovery";
import {
	groupKeyManager,
	parseGroupKeyDistribution,
} from "@src/common/group-messaging";
import {
	fetchInbox,
	sendDirectMessage,
	type DecryptedMessage,
} from "@src/common/signal-messaging";
import { useSignalIdentity } from "@src/hooks/use-signal-identity";
import {
	useConversationsStore,
	type ConversationPeer,
	type DirectMessageEntry,
} from "@src/store/conversations";
import { useMessagingStore } from "@src/store/messaging";
import { useSignalStore } from "@src/store/signal";

const INBOX_POLL_INTERVAL_MS = 5_000;
const SOLANA_ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

type UseDirectMessagesResult = {
	isReady: boolean;
	isEnabling: boolean;
	error: string | undefined;
	/** The user's own encryption address (public key) to share with peers. */
	address: string | undefined;
	enable: () => Promise<void>;
	peers: Array<ConversationPeer>;
	threads: Record<string, Array<DirectMessageEntry>>;
	/** Resolves an @handle / agent id / raw encryption key to a peer and adds it. */
	addPeer: (input: string) => Promise<void>;
	send: (address: string, text: string) => Promise<void>;
	isSending: boolean;
	/** Marks every message in a peer's thread as read. */
	markThreadRead: (address: string) => void;
};

/**
 * Drives the encrypted direct-message experience: identity enablement, inbox
 * polling (decrypt + accumulate, since the relay deletes acknowledged messages),
 * peer resolution via the directory, and sending.
 */
export function useDirectMessages(): UseDirectMessagesResult {
	const walletClient = useApiClient();
	const {
		status,
		isReady,
		error,
		enable: enableIdentity,
	} = useSignalIdentity();
	const identity = useSignalStore((state) => state.identity);
	const encryptionClient = useMessagingStore((state) => state.encryptionClient);
	const session = useMessagingStore((state) => state.session);

	const peers = useConversationsStore((state) => state.peers);
	const threads = useConversationsStore((state) => state.threads);
	const addPeerToStore = useConversationsStore((state) => state.addPeer);
	const appendOutgoing = useConversationsStore((state) => state.appendOutgoing);
	const appendIncoming = useConversationsStore((state) => state.appendIncoming);
	const markThreadRead = useConversationsStore((state) => state.markThreadRead);

	useQuery({
		queryKey: ["direct-messages", "inbox", identity?.signer.publicKeyBase64],
		enabled: isReady && Boolean(encryptionClient && session && identity),
		refetchInterval: INBOX_POLL_INTERVAL_MS,
		queryFn: async (): Promise<Array<DecryptedMessage>> => {
			if (!encryptionClient || !session || !identity) {
				return [];
			}
			const messages = await fetchInbox(
				encryptionClient,
				session,
				identity,
				// Group sender-key handoffs travel as DMs; install them as receiver
				// keys instead of surfacing them in a conversation thread.
				(_from, text): boolean => {
					const payload = parseGroupKeyDistribution(text);
					if (!payload) {
						return false;
					}
					groupKeyManager.installReceiver(payload);
					return true;
				}
			);
			appendIncoming(messages);
			return messages;
		},
	});

	const sendMutation = useMutation({
		mutationFn: async (input: {
			address: string;
			text: string;
		}): Promise<void> => {
			if (!encryptionClient || !session || !identity) {
				throw new Error("Encryption is not ready");
			}
			await sendDirectMessage(
				encryptionClient,
				session,
				identity,
				input.address,
				input.text
			);
		},
	});

	const enable = useCallback(async (): Promise<void> => {
		await enableIdentity();
	}, [enableIdentity]);

	const addPeer = useCallback(
		async (input: string): Promise<void> => {
			const trimmed = input.trim();
			if (!trimmed) {
				return;
			}
			if (trimmed.startsWith("@") || SOLANA_ADDRESS_PATTERN.test(trimmed)) {
				const card = await walletClient.directory.getAgent(trimmed);
				addPeerToStore({
					address: resolveEncryptionAddress(card),
					label: card.username ?? card.agentId,
				});
				return;
			}
			addPeerToStore({ address: trimmed, label: `${trimmed.slice(0, 10)}…` });
		},
		[walletClient, addPeerToStore]
	);

	const send = useCallback(
		async (address: string, text: string): Promise<void> => {
			const body = text.trim();
			if (!body) {
				return;
			}
			await sendMutation.mutateAsync({ address, text: body });
			appendOutgoing(address, {
				id: `local_${new Date().getTime()}`,
				text: body,
				at: new Date().toISOString(),
				outgoing: true,
				read: true,
			});
		},
		[sendMutation, appendOutgoing]
	);

	return {
		isReady,
		isEnabling: status === "loading",
		error,
		address: identity?.signer.publicKeyBase64,
		enable,
		peers,
		threads,
		addPeer,
		send,
		isSending: sendMutation.isPending,
		markThreadRead,
	};
}
