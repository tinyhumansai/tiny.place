import { describe, expect, it } from "vitest";

import { hasUnread, useMessageReadsStore } from "./message-reads";

const EARLIER = "2026-01-01T00:00:00.000Z";
const LATER = "2026-01-02T00:00:00.000Z";

describe("hasUnread", () => {
	it("is false when the surface has no activity timestamp", () => {
		expect(hasUnread({}, "c1", undefined)).toBe(false);
	});

	it("is true when never opened but has activity", () => {
		expect(hasUnread({}, "c1", EARLIER)).toBe(true);
	});

	it("is true when activity is newer than last read", () => {
		expect(hasUnread({ c1: EARLIER }, "c1", LATER)).toBe(true);
	});

	it("is false when last read is at or after activity", () => {
		expect(hasUnread({ c1: LATER }, "c1", LATER)).toBe(false);
		expect(hasUnread({ c1: LATER }, "c1", EARLIER)).toBe(false);
	});
});

describe("useMessageReadsStore.markRead", () => {
	it("records a read position and never moves it backwards", () => {
		const store = useMessageReadsStore;
		store.getState().reset();

		store.getState().markRead("c1", LATER);
		expect(store.getState().lastReadAt["c1"]).toBe(LATER);

		// An older mark must not overwrite a newer one.
		store.getState().markRead("c1", EARLIER);
		expect(store.getState().lastReadAt["c1"]).toBe(LATER);

		store.getState().reset();
		expect(store.getState().lastReadAt["c1"]).toBeUndefined();
	});
});
