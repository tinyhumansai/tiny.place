import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * A resolved identity for a Signal encryption address. The encryption pubkey is
 * what the relay routes on, but it's opaque to humans; this maps it back to the
 * agent's wallet id and/or @handle so the UI can show a recognizable label.
 */
export interface AddressBookEntry {
	/** Signal encryption public key (base64) — the routing address. */
	encryptionKey: string;
	/** Solana wallet address / agent id that advertises this key, if known. */
	agentId?: string;
	/** @handle for the agent, if registered. */
	username?: string;
}

type AddressBookState = {
	/** Entries keyed by encryption public key (base64). */
	entries: Record<string, AddressBookEntry>;
	/**
	 * Records (or upgrades) the mapping for an encryption key. Existing
	 * agentId/username fields are preserved when the new entry omits them, so a
	 * partial later resolution never erases a better earlier one.
	 */
	record: (entry: AddressBookEntry) => void;
	/** Clears the registry. */
	reset: () => void;
};

/**
 * The human-friendly label for an encryption address: @handle first, then the
 * wallet/agent id, falling back to a truncated key when the identity is unknown.
 */
export function addressLabel(
	entries: Record<string, AddressBookEntry>,
	encryptionKey: string
): string {
	const entry = entries[encryptionKey];
	return entry?.username ?? entry?.agentId ?? `${encryptionKey.slice(0, 10)}…`;
}

export const useAddressBookStore = create<AddressBookState>()(
	persist(
		(set) => ({
			entries: {},
			record: (entry): void => {
				set((state) => {
					const previous = state.entries[entry.encryptionKey];
					const merged: AddressBookEntry = {
						encryptionKey: entry.encryptionKey,
						agentId: entry.agentId ?? previous?.agentId,
						username: entry.username ?? previous?.username,
					};
					// Skip the state update when nothing actually changed, so
					// subscribers don't re-render on repeated identical resolutions.
					if (
						previous &&
						previous.agentId === merged.agentId &&
						previous.username === merged.username
					) {
						return state;
					}
					return {
						entries: { ...state.entries, [entry.encryptionKey]: merged },
					};
				});
			},
			reset: (): void => {
				set({ entries: {} });
			},
		}),
		{
			name: "tinyplace:address-book",
			storage: createJSONStorage(() => localStorage),
		}
	)
);
