"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useApiClient } from "@src/common/api-context";
import { lookupAgentByEncryptionKey } from "@src/common/encryption-discovery";
import { resolveDirectoryPeer } from "@src/common/peer-resolution";
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
import { addressLabel, useAddressBookStore } from "@src/store/address-book";
import { useAuthStore } from "@src/store/auth";
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
	/** The user's own encryption address (public key) — the raw routing key. */
	address: string | undefined;
	/**
	 * The user's wallet address (agent id) — the human-shareable identifier peers
	 * use to start a DM. Resolves to {@link address} via the directory.
	 */
	walletAddress: string | undefined;
	enable: () => Promise<void>;
	peers: Array<ConversationPeer>;
	threads: Record<string, Array<DirectMessageEntry>>;
	/**
	 * Resolves an @handle / agent id / raw encryption key to a peer and adds it.
	 * Resolves to `true` on success, `false` on failure (with {@link addPeerError}
	 * set) — never rejects, so fire-and-forget call sites can't leak a rejection.
	 */
	addPeer: (input: string) => Promise<boolean>;
	/** Set when the last {@link addPeer} failed (e.g. an unresolvable handle). */
	addPeerError: string | undefined;
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
	const walletAddress = useAuthStore((state) => state.agentId);
	const encryptionClient = useMessagingStore((state) => state.encryptionClient);
	const session = useMessagingStore((state) => state.session);

	const peers = useConversationsStore((state) => state.peers);
	const threads = useConversationsStore((state) => state.threads);
	const addPeerToStore = useConversationsStore((state) => state.addPeer);
	const appendOutgoing = useConversationsStore((state) => state.appendOutgoing);
	const appendIncoming = useConversationsStore((state) => state.appendIncoming);
	const markThreadRead = useConversationsStore((state) => state.markThreadRead);

	const addressBook = useAddressBookStore((state) => state.entries);
	const recordIdentity = useAddressBookStore((state) => state.record);

	// Surfaced to the UI when adding a peer fails (e.g. an unresolvable handle),
	// so the failure isn't swallowed by the fire-and-forget call site.
	const [addPeerError, setAddPeerError] = useState<string | undefined>(
		undefined
	);

	// Resolve each peer's label from the registry (handle / wallet id), falling
	// back to whatever label the peer was stored with (a truncated key). This is
	// what upgrades an opaque base64 sender to a recognizable name once resolved.
	const resolvedPeers = useMemo(
		(): Array<ConversationPeer> =>
			peers.map((peer) => ({
				...peer,
				label: addressBook[peer.address]
					? addressLabel(addressBook, peer.address)
					: peer.label,
			})),
		[peers, addressBook]
	);

	// Encryption keys we've already attempted to reverse-resolve this session, so
	// the 5s inbox poll doesn't re-scan the directory for the same stranger. Kept
	// in a ref (not persisted) so a reload re-attempts unresolved keys.
	const attemptedLookups = useRef<Set<string>>(new Set());

	useEffect((): void => {
		const unknown = peers.filter(
			(peer) =>
				!addressBook[peer.address] &&
				!attemptedLookups.current.has(peer.address)
		);
		for (const peer of unknown) {
			attemptedLookups.current.add(peer.address);
			void lookupAgentByEncryptionKey(walletClient, peer.address).then(
				(resolved): void => {
					if (resolved) {
						recordIdentity({
							encryptionKey: peer.address,
							agentId: resolved.agentId,
							username: resolved.username,
						});
					}
				}
			);
		}
	}, [peers, addressBook, walletClient, recordIdentity]);

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

	// Resolves a @handle / cryptoId via the directory (recording its identity) and
	// adds it; a raw key is stored directly. Throws when resolution fails.
	const resolveAndRecordPeer = useCallback(
		async (recipient: string): Promise<void> => {
			if (recipient.startsWith("@") || SOLANA_ADDRESS_PATTERN.test(recipient)) {
				const peer = await resolveDirectoryPeer(walletClient, recipient);
				// Record the encryption-key → identity mapping so this peer (and any
				// future inbound messages from them) resolve to a real label.
				recordIdentity({
					encryptionKey: peer.address,
					agentId: peer.agentId,
					username: peer.username,
				});
				addPeerToStore({
					address: peer.address,
					label: peer.username ?? peer.agentId,
				});
				return;
			}
			addPeerToStore({
				address: recipient,
				label: `${recipient.slice(0, 10)}…`,
			});
		},
		[walletClient, addPeerToStore, recordIdentity]
	);

	const addPeer = useCallback(
		async (input: string): Promise<boolean> => {
			const trimmed = input.trim();
			if (!trimmed) {
				return false;
			}
			setAddPeerError(undefined);
			try {
				await resolveAndRecordPeer(trimmed);
				return true;
			} catch (caught) {
				setAddPeerError(
					caught instanceof Error ? caught.message : `Could not add ${trimmed}`
				);
				return false;
			}
		},
		[resolveAndRecordPeer]
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
		walletAddress,
		enable,
		peers: resolvedPeers,
		threads,
		addPeer,
		addPeerError,
		send,
		isSending: sendMutation.isPending,
		markThreadRead,
	};
}
