// Offline, deterministic test of daemon inbound routing: pure routeTarget plus
// enqueueRouted / drainInbox / redeliverUnrouted against a live/dead registry.
import { mkdtempSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.TINYPLACE_CLAUDE_HOME = mkdtempSync(join(tmpdir(), "tinyplace-route-"));
delete process.env.TINYPLACE_SESSION_LIVE_MS;
const reg = await import("./mcp/registry.mjs");
const routing = await import("./mcp/routing.mjs");

const checks = [];
const expect = (label, cond) => { checks.push({ label, ok: !!cond }); console.log((cond ? "PASS " : "FAIL ") + label); };

// ── pure routeTarget ─────────────────────────────────────────────────────────
const live = ["claude:1", "claude:2"];
expect("to_session live → that session", routing.routeTarget({ toSession: "claude:2", liveLabels: live, primary: "claude:1" }).labels?.[0] === "claude:2");
expect("to_session dead → unrouted", routing.routeTarget({ toSession: "claude:9", liveLabels: live, primary: "claude:1" }).kind === "unrouted");
expect("no target, primary policy → primary", routing.routeTarget({ liveLabels: live, primary: "claude:1", policy: "primary" }).labels?.[0] === "claude:1");
expect("no target, no live, primary → unrouted", routing.routeTarget({ liveLabels: [], primary: null, policy: "primary" }).kind === "unrouted");
const bc = routing.routeTarget({ liveLabels: live, primary: "claude:1", policy: "broadcast" });
expect("no target, broadcast → all live labels", bc.kind === "session" && bc.labels.join(",") === "claude:1,claude:2");
expect("no target, drop policy → drop", routing.routeTarget({ liveLabels: live, primary: "claude:1", policy: "drop" }).kind === "drop");

// ── enqueueRouted against a real registry ────────────────────────────────────
const A = "AgentRRRRRRRRRRRRRRRRRRRRRRRRRRRR";
// Make claude:1 and claude:2 live (our own pid).
reg.writePresence(A, { label: "claude:1", harnessSessionId: "h1", cwd: "/w", startedAt: new Date().toISOString() });
reg.writePresence(A, { label: "claude:2", harnessSessionId: "h2", cwd: "/w", startedAt: new Date().toISOString() });

const r1 = routing.enqueueRouted(A, { id: "m1", from: "peerX", text: "for one", toSession: "claude:1" });
expect("targeted live → session inbox", r1.target.kind === "session" && r1.target.labels[0] === "claude:1");
expect("claude:1 inbox has the file", existsSync(join(routing.sessionInboxDir(A, "claude:1"), "m1.json")));

const r2 = routing.enqueueRouted(A, { id: "m2", from: "peerX", text: "for ghost", toSession: "claude:9" });
expect("targeted dead → unrouted (not any inbox)", r2.target.kind === "unrouted");
expect("claude:2 inbox does NOT have m2", !existsSync(join(routing.sessionInboxDir(A, "claude:2"), "m2.json")));

const r3 = routing.enqueueRouted(A, { id: "m3", from: "peerY", text: "no target" }, { policy: "primary" });
expect("untargeted primary → claude:1 inbox", r3.target.labels[0] === "claude:1" && existsSync(join(routing.sessionInboxDir(A, "claude:1"), "m3.json")));

const r4 = routing.enqueueRouted(A, { id: "m4", from: "peerZ", text: "everyone" }, { policy: "broadcast" });
expect("untargeted broadcast → both inboxes", existsSync(join(routing.sessionInboxDir(A, "claude:1"), "m4.json")) && existsSync(join(routing.sessionInboxDir(A, "claude:2"), "m4.json")));

// ── drainInbox claims files ──────────────────────────────────────────────────
const drained1 = routing.drainInbox(A, "claude:1"); // m1, m3, m4
const ids1 = drained1.map((p) => p.id).sort();
expect("drainInbox(claude:1) returns its 3 messages", ids1.join(",") === "m1,m3,m4");
expect("drainInbox claims (second drain is empty)", routing.drainInbox(A, "claude:1").length === 0);
expect("drained payload carries text + from", drained1.find((p) => p.id === "m1")?.text === "for one" && drained1.find((p) => p.id === "m1")?.from === "peerX");

// ── redeliverUnrouted when the target becomes live ───────────────────────────
expect("m2 held in _unrouted before target is live", routing.drainInbox(A, "claude:9").length === 0);
reg.writePresence(A, { label: "claude:9", harnessSessionId: "h9", cwd: "/w", startedAt: new Date().toISOString() });
const moved = routing.redeliverUnrouted(A);
expect("redeliverUnrouted moved 1 held message", moved === 1);
const drained9 = routing.drainInbox(A, "claude:9");
expect("claude:9 now receives its held message m2", drained9.length === 1 && drained9[0].id === "m2");

// ── untargeted mail held while no session is live, redelivered to primary ─────
const U = "AgentUUUUUUUUUUUUUUUUUUUUUUUUUUUU";
const ru = routing.enqueueRouted(U, { id: "u1", from: "peerU", text: "nobody home" }, { policy: "primary" });
expect("untargeted with no live session → unrouted", ru.target.kind === "unrouted");
expect("no inbox exists yet for U", !existsSync(routing.sessionInboxDir(U, "claude:1")));
reg.writePresence(U, { label: "claude:1", harnessSessionId: "hu", cwd: "/w", startedAt: new Date().toISOString() });
const movedU = routing.redeliverUnrouted(U, { policy: "primary" });
expect("redeliverUnrouted delivers held untargeted mail to primary", movedU === 1);
const dU = routing.drainInbox(U, "claude:1");
expect("primary session now receives the held untargeted message", dU.length === 1 && dU[0].id === "u1");

const failed = checks.filter((c) => !c.ok);
console.log("\n" + (failed.length === 0 ? `ALL ${checks.length} CHECKS PASSED ✅` : `${failed.length} FAILED ❌`));
process.exit(failed.length === 0 ? 0 : 1);
