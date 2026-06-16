import { describe, expect, it } from "vitest";

import {
	unreadForPeer,
	unreadTotal,
	useConversationsStore,
	type DirectMessageEntry,
} from "./conversations";

function entry(
	id: string,
	overrides: Partial<DirectMessageEntry> = {}
): DirectMessageEntry {
	return {
		id,
		text: id,
		at: "2026-01-01T00:00:00.000Z",
		outgoing: false,
		read: false,
		...overrides,
	};
}

describe("conversations unread helpers", () => {
	it("counts only inbound, unread messages per peer", () => {
		const threads = {
			alice: [
				entry("a1"),
				entry("a2", { read: true }),
				entry("a3", { outgoing: true, read: false }),
			],
		};
		expect(unreadForPeer(threads, "alice")).toBe(1);
		expect(unreadForPeer(threads, "missing")).toBe(0);
	});

	it("sums unread across all threads", () => {
		const threads = {
			alice: [entry("a1"), entry("a2")],
			bob: [entry("b1", { read: true }), entry("b2")],
		};
		expect(unreadTotal(threads)).toBe(3);
	});
});

describe("useConversationsStore", () => {
	it("appendIncoming marks inbound messages unread; markThreadRead clears them", () => {
		const store = useConversationsStore;
		store.getState().reset();

		store
			.getState()
			.appendIncoming([
				{ id: "m1", from: "alice", text: "hi", at: "2026-01-01T00:00:00.000Z" },
			]);
		expect(unreadForPeer(store.getState().threads, "alice")).toBe(1);

		store.getState().markThreadRead("alice");
		expect(unreadForPeer(store.getState().threads, "alice")).toBe(0);

		store.getState().reset();
	});

	it("outgoing messages never count as unread", () => {
		const store = useConversationsStore;
		store.getState().reset();
		store
			.getState()
			.appendOutgoing("bob", entry("o1", { outgoing: true, read: true }));
		expect(unreadForPeer(store.getState().threads, "bob")).toBe(0);
		store.getState().reset();
	});
});

describe("useConversationsStore ensureOwner scoping", () => {
	it("keeps threads when re-bound to the same owner (reload of same wallet)", () => {
		const store = useConversationsStore;
		store.getState().reset();

		store.getState().ensureOwner("wallet-a");
		store
			.getState()
			.appendIncoming([
				{ id: "m1", from: "alice", text: "hi", at: "2026-01-01T00:00:00.000Z" },
			]);
		expect(store.getState().threads.alice).toHaveLength(1);

		// Re-binding the same owner (as enable() does on every load) must preserve
		// the persisted history.
		store.getState().ensureOwner("wallet-a");
		expect(store.getState().owner).toBe("wallet-a");
		expect(store.getState().threads.alice).toHaveLength(1);

		store.getState().reset();
	});

	it("clears threads when re-bound to a different owner (wallet switch)", () => {
		const store = useConversationsStore;
		store.getState().reset();

		store.getState().ensureOwner("wallet-a");
		store
			.getState()
			.appendIncoming([
				{ id: "m1", from: "alice", text: "hi", at: "2026-01-01T00:00:00.000Z" },
			]);
		expect(store.getState().threads.alice).toHaveLength(1);

		// A different identity must never inherit the previous wallet's history.
		store.getState().ensureOwner("wallet-b");
		expect(store.getState().owner).toBe("wallet-b");
		expect(store.getState().threads).toEqual({});
		expect(store.getState().peers).toEqual([]);

		store.getState().reset();
	});
});
