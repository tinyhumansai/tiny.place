import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** A single message in a group thread. */
export interface GroupMessageEntry {
	id: string;
	/** Sender agent id. */
	from: string;
	text: string;
	at: string;
	outgoing: boolean;
	read: boolean;
}

type GroupConversationsState = {
	/**
	 * Encryption address the persisted threads belong to, so a different wallet
	 * never sees the previous user's group history rehydrated from storage.
	 */
	owner: string | undefined;
	/** Messages keyed by groupId, oldest first. */
	threads: Record<string, Array<GroupMessageEntry>>;
	/**
	 * Binds the store to `owner`, clearing any persisted threads that belonged to
	 * a different identity. A no-op when already bound to the same owner.
	 */
	ensureOwner: (owner: string) => void;
	/** Appends an outgoing message to a group's thread. */
	appendOutgoing: (groupId: string, message: GroupMessageEntry) => void;
	/** Appends decrypted inbound group messages, de-duplicated by id. */
	appendIncoming: (
		messages: Array<{
			id: string;
			groupId: string;
			from: string;
			text: string;
			at: string;
		}>
	) => void;
	/** Marks every message in a group's thread as read (e.g. when it is opened). */
	markGroupRead: (groupId: string) => void;
	/** Clears all group threads (e.g. on wallet disconnect). */
	reset: () => void;
};

/** Number of unread (inbound, not-yet-read) messages in a group's thread. */
export function groupUnread(
	threads: Record<string, Array<GroupMessageEntry>>,
	groupId: string
): number {
	return (threads[groupId] ?? []).filter(
		(entry) => !entry.outgoing && !entry.read
	).length;
}

type PersistedGroupConversationsState = Pick<
	GroupConversationsState,
	"owner" | "threads"
>;

export const useGroupConversationsStore = create<GroupConversationsState>()(
	persist(
		(set) => ({
			owner: undefined,
			threads: {},
			ensureOwner: (owner): void => {
				set((state) =>
					state.owner === owner ? state : { owner, threads: {} }
				);
			},
			appendOutgoing: (groupId, message): void => {
				set((state) => ({
					threads: {
						...state.threads,
						[groupId]: [...(state.threads[groupId] ?? []), message],
					},
				}));
			},
			appendIncoming: (messages): void => {
				if (messages.length === 0) {
					return;
				}
				set((state) => {
					const threads = { ...state.threads };
					for (const message of messages) {
						const existing = threads[message.groupId] ?? [];
						if (existing.some((entry) => entry.id === message.id)) {
							continue;
						}
						threads[message.groupId] = [
							...existing,
							{
								id: message.id,
								from: message.from,
								text: message.text,
								at: message.at,
								outgoing: false,
								read: false,
							},
						];
					}
					return { threads };
				});
			},
			markGroupRead: (groupId): void => {
				set((state) => {
					const thread = state.threads[groupId];
					if (!thread || thread.every((entry) => entry.read)) {
						return state;
					}
					return {
						threads: {
							...state.threads,
							[groupId]: thread.map((entry) =>
								entry.read ? entry : { ...entry, read: true }
							),
						},
					};
				});
			},
			reset: (): void => {
				set({ owner: undefined, threads: {} });
			},
		}),
		{
			name: "tinyplace:group-conversations",
			partialize: (state): PersistedGroupConversationsState => ({
				owner: state.owner,
				threads: state.threads,
			}),
			storage: createJSONStorage(() => localStorage),
		}
	)
);
