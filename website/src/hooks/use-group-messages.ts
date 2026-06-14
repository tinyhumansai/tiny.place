"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { useApiClient } from "@src/common/api-context";
import {
	fetchGroupInbox,
	sendGroupMessage,
	type DecryptedGroupMessage,
} from "@src/common/group-messaging";
import { useSignalIdentity } from "@src/hooks/use-signal-identity";
import {
	useGroupConversationsStore,
	type GroupMessageEntry,
} from "@src/store/group-conversations";
import { useMessagingStore } from "@src/store/messaging";
import { useSignalStore } from "@src/store/signal";

const GROUP_INBOX_POLL_INTERVAL_MS = 5_000;

type UseGroupMessagesResult = {
	/** Whether encrypted messaging is ready (DM key handoffs require it). */
	isReady: boolean;
	threads: Record<string, Array<GroupMessageEntry>>;
	send: (input: {
		groupId: string;
		epoch: number;
		members: Array<string>;
		text: string;
	}) => Promise<void>;
	isSending: boolean;
	markGroupRead: (groupId: string) => void;
};

/**
 * Drives encrypted group messaging for the active identity: polls the
 * wallet-addressed relay inbox for fanned-out group messages (decrypting any
 * this client holds a sender key for), and sends via the Sender-Key fanout path.
 * Receiving depends on the DM poll (in `useDirectMessages`) to install the
 * per-sender keys that arrive as 1:1 handoffs.
 */
export function useGroupMessages(actor: string): UseGroupMessagesResult {
	const walletClient = useApiClient();
	const { isReady } = useSignalIdentity();
	const identity = useSignalStore((state) => state.identity);
	const encryptionClient = useMessagingStore((state) => state.encryptionClient);
	const session = useMessagingStore((state) => state.session);

	const threads = useGroupConversationsStore((state) => state.threads);
	const appendIncoming = useGroupConversationsStore(
		(state) => state.appendIncoming
	);
	const appendOutgoing = useGroupConversationsStore(
		(state) => state.appendOutgoing
	);
	const markGroupRead = useGroupConversationsStore(
		(state) => state.markGroupRead
	);

	useQuery({
		queryKey: ["group-messages", "inbox", actor],
		enabled: Boolean(actor) && isReady,
		refetchInterval: GROUP_INBOX_POLL_INTERVAL_MS,
		queryFn: async (): Promise<Array<DecryptedGroupMessage>> => {
			if (!actor) {
				return [];
			}
			const messages = await fetchGroupInbox(walletClient, actor);
			appendIncoming(messages);
			return messages;
		},
	});

	const sendMutation = useMutation({
		mutationFn: async (input: {
			groupId: string;
			epoch: number;
			members: Array<string>;
			text: string;
		}): Promise<DecryptedGroupMessage> => {
			if (!encryptionClient || !session || !identity) {
				throw new Error("Enable encryption before sending group messages");
			}
			return sendGroupMessage({
				walletClient,
				encClient: encryptionClient,
				session,
				identity,
				groupId: input.groupId,
				epoch: input.epoch,
				sender: actor,
				members: input.members,
				text: input.text,
			});
		},
	});

	const send = useCallback(
		async (input: {
			groupId: string;
			epoch: number;
			members: Array<string>;
			text: string;
		}): Promise<void> => {
			const text = input.text.trim();
			if (!text) {
				return;
			}
			const sent = await sendMutation.mutateAsync({ ...input, text });
			appendOutgoing(sent.groupId, {
				id: sent.id,
				from: sent.from,
				text: sent.text,
				at: sent.at,
				outgoing: true,
				read: true,
			});
		},
		[sendMutation, appendOutgoing]
	);

	return {
		isReady,
		threads,
		send,
		isSending: sendMutation.isPending,
		markGroupRead,
	};
}
