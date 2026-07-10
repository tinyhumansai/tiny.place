import { describe, expect, it } from "vitest";

import {
  mergeLocalAgentEntry,
  type LocalAgentEntry,
  type LocalAgentsFile,
} from "../src/cli/harness-wrapper.js";

// The co-location handshake file a wrapped agent writes before it sends its
// contact request, so a same-machine OpenHuman can auto-accept without a manual
// click. `mergeLocalAgentEntry` is the pure TTL/upsert contract — it must stay in
// lockstep with the OpenHuman-side reader (1h TTL, own-row replace, prune stale).

const NOW = Date.parse("2026-07-10T12:00:00.000Z");

function entry(over: Partial<LocalAgentEntry> = {}): LocalAgentEntry {
  return {
    agentId: "self-key",
    owner: "owner-key",
    cwd: "/work/proj",
    provider: "codex",
    ts: "2026-07-10T12:00:00.000Z",
    ...over,
  };
}

describe("mergeLocalAgentEntry", () => {
  it("adds an entry to an empty registry", () => {
    const next = mergeLocalAgentEntry({ version: 1, agents: [] }, entry(), NOW);
    expect(next.agents).toEqual([entry()]);
  });

  it("replaces this agent's own prior row instead of duplicating it", () => {
    const file: LocalAgentsFile = {
      version: 1,
      agents: [entry({ owner: "stale-owner", ts: "2026-07-10T11:59:00.000Z" })],
    };
    const next = mergeLocalAgentEntry(file, entry({ owner: "fresh-owner" }), NOW);
    expect(next.agents).toHaveLength(1);
    expect(next.agents[0].owner).toBe("fresh-owner");
  });

  it("keeps other agents' fresh rows", () => {
    const other = entry({ agentId: "peer-key", ts: "2026-07-10T11:30:00.000Z" });
    const next = mergeLocalAgentEntry({ version: 1, agents: [other] }, entry(), NOW);
    expect(next.agents.map((a) => a.agentId).sort()).toEqual(["peer-key", "self-key"]);
  });

  it("prunes expired (past-TTL) and undated foreign rows", () => {
    const file: LocalAgentsFile = {
      version: 1,
      agents: [
        entry({ agentId: "expired", ts: "2026-07-10T10:59:00.000Z" }), // 61 min → gone
        entry({ agentId: "undated", ts: "not-a-timestamp" }), // unparseable → gone
        entry({ agentId: "fresh", ts: "2026-07-10T11:15:00.000Z" }), // 45 min → kept
      ],
    };
    const next = mergeLocalAgentEntry(file, entry(), NOW);
    expect(next.agents.map((a) => a.agentId).sort()).toEqual(["fresh", "self-key"]);
  });
});
