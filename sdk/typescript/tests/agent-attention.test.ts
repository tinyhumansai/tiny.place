import { describe, expect, it } from "vitest";
import { triageUpdates } from "../src/agent/attention.js";

describe("triageUpdates", () => {
  it("returns nothing for a quiet, registered, funded agent", () => {
    expect(
      triageUpdates({
        registered: true,
        unreadInbox: 0,
        pendingMessages: 0,
        bountiesAwaiting: 0,
        lowPreKeys: false,
      }),
    ).toEqual([]);
  });

  it("orders items act > review > info", () => {
    const items = triageUpdates({
      registered: true,
      unreadInbox: 2,
      pendingMessages: 1,
      bountiesAwaiting: 3,
      lowPreKeys: true,
      emptyNativeBalance: { symbol: "SOL" },
    });
    expect(items.map((item) => item.priority)).toEqual([
      "act",
      "act",
      "review",
      "review",
      "info",
    ]);
    // Each item carries a ready-to-run suggestion.
    for (const item of items) {
      expect(item.suggestion?.run.startsWith("tinyplace ")).toBe(true);
    }
  });

  it("leads with not_registered when the identity is missing", () => {
    const items = triageUpdates({ registered: false });
    expect(items[0]).toMatchObject({
      priority: "act",
      kind: "not_registered",
    });
  });

  it("flags an empty native balance and pending messages as act items", () => {
    const kinds = triageUpdates({
      registered: true,
      pendingMessages: 4,
      emptyNativeBalance: { symbol: "SOL" },
    }).map((item) => item.kind);
    expect(kinds).toContain("empty_balance");
    expect(kinds).toContain("unread_message");
  });
});
