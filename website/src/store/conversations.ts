import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** A single direct message in a conversation thread. */
export interface DirectMessageEntry {
	id: string;
	text: string;
	at: string;
	outgoing: boolean;
	/** Whether this message has been read. Outgoing messages are always read. */
	read: boolean;
}

/** A conversation peer, addressed by encryption pubkey with a display label. */
export interface ConversationPeer {
	/** Recipient messaging address (base64 encryption pubkey). */
	address: string;
	/** Human-friendly label (handle, agent id, or truncated key). */
	label: string;
}

type ConversationsState = {
	/**
	 * Encryption address the persisted threads belong to. Conversations are
	 * scoped to one identity so a different wallet never sees the previous user's
	 * (decrypted) history rehydrated from storage.
	 */
	owner: string | undefined;
	peers: Array<ConversationPeer>;
	/** Messages keyed by peer address, oldest first. */
	threads: Record<string, Array<DirectMessageEntry>>;
	/**
	 * Binds the store to `owner`, clearing any persisted threads that belonged to
	 * a different identity. A no-op when already bound to the same owner, so a
	 * reload of the same wallet keeps its history.
	 */
	ensureOwner: (owner: string) => void;
	/** Registers a peer to converse with (no-op if already present). */
	addPeer: (peer: ConversationPeer) => void;
	/** Appends an outgoing message to a peer's thread. */
	appendOutgoing: (address: string, message: DirectMessageEntry) => void;
	/** Appends decrypted inbound messages, de-duplicated by id, to their threads. */
	appendIncoming: (
		messages: Array<{ id: string; from: string; text: string; at: string }>
	) => void;
	/** Marks every message in a peer's thread as read (e.g. when it is opened). */
	markThreadRead: (address: string) => void;
	/** Clears all conversations (e.g. on wallet disconnect). */
	reset: () => void;
};

/** Total number of unread (inbound, not-yet-read) messages across all threads. */
export function unreadTotal(
	threads: Record<string, Array<DirectMessageEntry>>
): number {
	let total = 0;
	for (const thread of Object.values(threads)) {
		for (const entry of thread) {
			if (!entry.outgoing && !entry.read) {
				total += 1;
			}
		}
	}
	return total;
}

/** Number of unread (inbound, not-yet-read) messages in a single peer's thread. */
export function unreadForPeer(
	threads: Record<string, Array<DirectMessageEntry>>,
	address: string
): number {
	return (threads[address] ?? []).filter(
		(entry) => !entry.outgoing && !entry.read
	).length;
}

type PersistedConversationsState = Pick<
	ConversationsState,
	"owner" | "peers" | "threads"
>;

export const useConversationsStore = create<ConversationsState>()(
	persist(
		(set) => ({
			owner: undefined,
			peers: [],
			threads: {},
			ensureOwner: (owner): void => {
				set((state) =>
					state.owner === owner ? state : { owner, peers: [], threads: {} }
				);
			},
			addPeer: (peer): void => {
				set((state) => {
					if (
						state.peers.some((existing) => existing.address === peer.address)
					) {
						return state;
					}
					return { peers: [...state.peers, peer] };
				});
			},
			appendOutgoing: (address, message): void => {
				set((state) => ({
					threads: {
						...state.threads,
						[address]: [...(state.threads[address] ?? []), message],
					},
				}));
			},
			appendIncoming: (messages): void => {
				if (messages.length === 0) {
					return;
				}
				set((state) => {
					const threads = { ...state.threads };
					const peers = [...state.peers];
					for (const message of messages) {
						const existing = threads[message.from] ?? [];
						if (existing.some((entry) => entry.id === message.id)) {
							continue;
						}
						threads[message.from] = [
							...existing,
							{
								id: message.id,
								text: message.text,
								at: message.at,
								outgoing: false,
								read: false,
							},
						];
						if (!peers.some((peer) => peer.address === message.from)) {
							peers.push({
								address: message.from,
								label: `${message.from.slice(0, 10)}…`,
							});
						}
					}
					return { threads, peers };
				});
			},
			markThreadRead: (address): void => {
				set((state) => {
					const thread = state.threads[address];
					if (!thread || thread.every((entry) => entry.read)) {
						return state;
					}
					return {
						threads: {
							...state.threads,
							[address]: thread.map((entry) =>
								entry.read ? entry : { ...entry, read: true }
							),
						},
					};
				});
			},
			reset: (): void => {
				set({ owner: undefined, peers: [], threads: {} });
			},
		}),
		{
			name: "tinyplace:conversations",
			partialize: (state): PersistedConversationsState => ({
				owner: state.owner,
				peers: state.peers,
				threads: state.threads,
			}),
			storage: createJSONStorage(() => localStorage),
		}
	)
);
