import { beforeEach, describe, expect, it } from "vitest";

import { addressLabel, useAddressBookStore } from "./address-book";

describe("addressLabel", () => {
	it("prefers username, then agentId, then a truncated key", () => {
		const key = "abcdefghijklmnop";
		expect(
			addressLabel({ [key]: { encryptionKey: key, username: "@alice" } }, key)
		).toBe("@alice");
		expect(
			addressLabel(
				{ [key]: { encryptionKey: key, agentId: "9B5Xwallet" } },
				key
			)
		).toBe("9B5Xwallet");
		expect(addressLabel({}, key)).toBe("abcdefghij…");
	});
});

describe("useAddressBookStore", () => {
	beforeEach(() => {
		useAddressBookStore.getState().reset();
	});

	it("records a mapping from encryption key to identity", () => {
		useAddressBookStore.getState().record({
			encryptionKey: "key-1",
			agentId: "wallet-1",
			username: "@bob",
		});
		expect(useAddressBookStore.getState().entries["key-1"]).toEqual({
			encryptionKey: "key-1",
			agentId: "wallet-1",
			username: "@bob",
		});
	});

	it("preserves known fields when a later partial resolution omits them", () => {
		const store = useAddressBookStore.getState();
		store.record({
			encryptionKey: "key-1",
			agentId: "wallet-1",
			username: "@bob",
		});
		// A later reverse lookup that only finds the wallet must not erase the handle.
		store.record({ encryptionKey: "key-1", agentId: "wallet-1" });
		expect(useAddressBookStore.getState().entries["key-1"]).toEqual({
			encryptionKey: "key-1",
			agentId: "wallet-1",
			username: "@bob",
		});
	});
});
