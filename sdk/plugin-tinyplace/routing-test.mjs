// Offline, deterministic test of daemon inbound routing: pure routeTarget plus
// enqueueRouted / drainInbox / redeliverUnrouted against a live/dead registry.
import { spawnSync } from "node:child_process";
import { mkdtempSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Pin the codex adapter so harnessDataDir() routes inbox files to TINYPLACE_CODEX_HOME.
process.env.TINYPLACE_HARNESS = "codex";
process.env.TINYPLACE_CODEX_HOME = mkdtempSync(join(tmpdir(), "tinyplace-route-"));
delete process.env.TINYPLACE_SESSION_LIVE_MS;
const reg = await import("./mcp/registry.mjs");
const routing = await import("./mcp/routing.mjs");

const checks = [];
const expect = (label, cond) => { checks.push({ label, ok: !!cond }); console.log((cond ? "PASS " : "FAIL ") + label); };

// ── pure routeTarget ─────────────────────────────────────────────────────────
const live = ["codex:1", "codex:2"];
expect("to_session live → that session", routing.routeTarget({ toSession: "codex:2", liveLabels: live, primary: "codex:1" }).labels?.[0] === "codex:2");
expect("to_session dead → unrouted", routing.routeTarget({ toSession: "codex:9", liveLabels: live, primary: "codex:1" }).kind === "unrouted");
expect("no target, primary policy → primary", routing.routeTarget({ liveLabels: live, primary: "codex:1", policy: "primary" }).labels?.[0] === "codex:1");
expect("no target, no live, primary → unrouted", routing.routeTarget({ liveLabels: [], primary: null, policy: "primary" }).kind === "unrouted");
const bc = routing.routeTarget({ liveLabels: live, primary: "codex:1", policy: "broadcast" });
expect("no target, broadcast → all live labels", bc.kind === "session" && bc.labels.join(",") === "codex:1,codex:2");
expect("no target, drop policy → drop", routing.routeTarget({ liveLabels: live, primary: "codex:1", policy: "drop" }).kind === "drop");

// ── enqueueRouted against a real registry ────────────────────────────────────
const A = "AgentRRRRRRRRRRRRRRRRRRRRRRRRRRRR";
// Make codex:1 and codex:2 live (our own pid).
reg.writePresence(A, { label: "codex:1", harnessSessionId: "h1", cwd: "/w", startedAt: new Date().toISOString() });
reg.writePresence(A, { label: "codex:2", harnessSessionId: "h2", cwd: "/w", startedAt: new Date().toISOString() });

const r1 = routing.enqueueRouted(A, { id: "m1", from: "peerX", text: "for one", toSession: "codex:1" });
expect("targeted live → session inbox", r1.target.kind === "session" && r1.target.labels[0] === "codex:1");
expect("codex:1 inbox has the file", existsSync(join(routing.sessionInboxDir(A, "codex:1"), "m1.json")));

const r2 = routing.enqueueRouted(A, { id: "m2", from: "peerX", text: "for ghost", toSession: "codex:9" });
expect("targeted dead → unrouted (not any inbox)", r2.target.kind === "unrouted");
expect("codex:2 inbox does NOT have m2", !existsSync(join(routing.sessionInboxDir(A, "codex:2"), "m2.json")));

const r3 = routing.enqueueRouted(A, { id: "m3", from: "peerY", text: "no target" }, { policy: "primary" });
expect("untargeted primary → codex:1 inbox", r3.target.labels[0] === "codex:1" && existsSync(join(routing.sessionInboxDir(A, "codex:1"), "m3.json")));

const r4 = routing.enqueueRouted(A, { id: "m4", from: "peerZ", text: "everyone" }, { policy: "broadcast" });
expect("untargeted broadcast → both inboxes", existsSync(join(routing.sessionInboxDir(A, "codex:1"), "m4.json")) && existsSync(join(routing.sessionInboxDir(A, "codex:2"), "m4.json")));

// ── drainInbox claims files ──────────────────────────────────────────────────
const drained1 = routing.drainInbox(A, "codex:1"); // m1, m3, m4
const ids1 = drained1.map((p) => p.id).sort();
expect("drainInbox(codex:1) returns its 3 messages", ids1.join(",") === "m1,m3,m4");
expect("drainInbox claims (second drain is empty)", routing.drainInbox(A, "codex:1").length === 0);
expect("drained payload carries text + from", drained1.find((p) => p.id === "m1")?.text === "for one" && drained1.find((p) => p.id === "m1")?.from === "peerX");

// ── redeliverUnrouted when the target becomes live ───────────────────────────
expect("m2 held in _unrouted before target is live", routing.drainInbox(A, "codex:9").length === 0);
reg.writePresence(A, { label: "codex:9", harnessSessionId: "h9", cwd: "/w", startedAt: new Date().toISOString() });
const moved = routing.redeliverUnrouted(A);
expect("redeliverUnrouted moved 1 held message", moved === 1);
const drained9 = routing.drainInbox(A, "codex:9");
expect("codex:9 now receives its held message m2", drained9.length === 1 && drained9[0].id === "m2");

// ── untargeted mail held while no session is live, redelivered to primary ─────
const U = "AgentUUUUUUUUUUUUUUUUUUUUUUUUUUUU";
const ru = routing.enqueueRouted(U, { id: "u1", from: "peerU", text: "nobody home" }, { policy: "primary" });
expect("untargeted with no live session → unrouted", ru.target.kind === "unrouted");
expect("no inbox exists yet for U", !existsSync(routing.sessionInboxDir(U, "codex:1")));
reg.writePresence(U, { label: "codex:1", harnessSessionId: "hu", cwd: "/w", startedAt: new Date().toISOString() });
const movedU = routing.redeliverUnrouted(U, { policy: "primary" });
expect("redeliverUnrouted delivers held untargeted mail to primary", movedU === 1);
const dU = routing.drainInbox(U, "codex:1");
expect("primary session now receives the held untargeted message", dU.length === 1 && dU[0].id === "u1");

// ── reapClosedTargets: mail bound to a now-closed session → notify + terminate ─
const C = "AgentCCCCCCCCCCCCCCCCCCCCCCCCCCCC";
reg.writePresence(C, { label: "codex:1", harnessSessionId: "hc", cwd: "/w", startedAt: new Date().toISOString() });
// A message addressed to a dead session is held (unrouted).
routing.enqueueRouted(C, { id: "c1", from: "peerC", fromSession: "codex:3", text: "hi ghost", toSession: "codex:8" });
expect("bound-dead within grace → not reaped", routing.reapClosedTargets(C, { graceMs: 100000 }).length === 0);
spawnSync("sleep", ["0.05"]); // age the held file past the grace used below
const reaped = routing.reapClosedTargets(C, { graceMs: 10 });
expect("bound-dead past grace → reaped once", reaped.length === 1 && reaped[0].id === "c1");
expect("reaped payload carries sender, its session, and the dead target", reaped[0].from === "peerC" && reaped[0].fromSession === "codex:3" && reaped[0].toSession === "codex:8");
expect("terminated: a second reap is empty", routing.reapClosedTargets(C, { graceMs: 0 }).length === 0);

// A target that is (or became) live is never reaped — redelivery handles it.
routing.enqueueRouted(C, { id: "c2", from: "peerC", text: "hi", toSession: "codex:7" }); // codex:7 dead → held
reg.writePresence(C, { label: "codex:7", harnessSessionId: "h7", cwd: "/w", startedAt: new Date().toISOString() });
expect("bound to a now-LIVE target → not reaped", routing.reapClosedTargets(C, { graceMs: 0 }).length === 0);

// Untargeted held mail (agent away, no live session) is NOT a closed-session case.
const D = "AgentDDDDDDDDDDDDDDDDDDDDDDDDDDDD";
routing.enqueueRouted(D, { id: "d1", from: "peerD", text: "no target" }); // untargeted, no live → held
expect("untargeted held mail is never reaped as closed", routing.reapClosedTargets(D, { graceMs: 0 }).length === 0);

// ── conversation-UUID routing (per (session,peer); reuse-proof binding) ──────
const E = "AgentEEEEEEEEEEEEEEEEEEEEEEEEEEEE";
reg.writePresence(E, { label: "codex:1", harnessSessionId: "he1", cwd: "/w", startedAt: new Date().toISOString() });
const suE1 = reg.resolveSessionUuid("he1"); // codex:1's durable session anchor
const convE = reg.resolveConversationUuid(suE1, "peerE"); // its wire-visible conversation id
expect("resolveConversationUuid mints a uuid, indexed to the session", reg.sessionUuidForConversation(convE) === suE1);
expect("resolveConversationUuid is idempotent per (session,peer)", reg.resolveConversationUuid(suE1, "peerE") === convE);
// A reply echoing the shared id (wrapper_session_id → fromSessionUuid) of a LIVE
// session is delivered to it.
const er1 = routing.enqueueRouted(E, { id: "e1", from: "peerE", text: "by shared id", fromSessionUuid: convE });
expect("shared session id of a live session → routed to its label", er1.target.kind === "session" && er1.target.labels[0] === "codex:1");
// An id we never minted (a brand-new thread) isn't in our index → it falls through to
// policy routing (default primary → the live codex:1): first-contact delivery.
const er2 = routing.enqueueRouted(E, { id: "e2", from: "peerE", text: "new thread", fromSessionUuid: "00000000-0000-0000-0000-000000000000" });
expect("unknown shared id → falls through to policy (primary), not held", er2.target.kind === "session" && er2.target.labels[0] === "codex:1");

// ── per-pair session-id routing (a peer like OpenHuman addresses a reply by the
//    per-pair session id WE minted — the conversation uuid — carried back in
//    wrapper_session_id / fromSessionUuid, with no separate to_session_uuid) ────
const H = "AgentHHHHHHHHHHHHHHHHHHHHHHHHHHHH";
reg.writePresence(H, { label: "codex:1", harnessSessionId: "hH1", cwd: "/w", startedAt: new Date().toISOString() });
const suH1 = reg.resolveSessionUuid("hH1");
const sid = reg.resolveConversationUuid(suH1, "openhuman"); // the per-pair session id we minted
// The peer echoes that same per-pair id back in wrapper_session_id (→ fromSessionUuid).
const hr1 = routing.enqueueRouted(H, { id: "h1s", from: "openhuman", text: "reply", fromSessionUuid: sid });
expect("per-pair session id (no to_session) → routed to its session", hr1.target.kind === "session" && hr1.target.labels[0] === "codex:1");
expect("per-pair reply landed in codex:1 inbox", existsSync(join(routing.sessionInboxDir(H, "codex:1"), "h1s.json")));
// An id we never minted isn't in our conversation index → the per-pair path is a
// no-op and the message falls through to normal policy routing (here `drop`).
const hr2 = routing.enqueueRouted(H, { id: "h2s", from: "openhuman", text: "ghost", fromSessionUuid: "99999999-9999-9999-9999-999999999999" }, { policy: "drop" });
expect("unknown id → not hijacked by the per-pair path (falls through to policy)", hr2.target.kind === "drop");

// The crux: a label reused by a DIFFERENT session must not inherit the old thread.
const F = "AgentFFFFFFFFFFFFFFFFFFFFFFFFFFFF";
reg.writePresence(F, { label: "codex:1", harnessSessionId: "old-sess", cwd: "/w", startedAt: new Date().toISOString() });
const suOld = reg.resolveSessionUuid("old-sess");
const convOld = reg.resolveConversationUuid(suOld, "peerF"); // the old session's conversation with peerF
reg.removePresence(F, "codex:1"); // old session closes → codex:1 frees
reg.writePresence(F, { label: "codex:1", harnessSessionId: "new-sess", cwd: "/w", startedAt: new Date().toISOString() }); // stranger takes codex:1
// The peer echoes the OLD session's shared id; its owner is gone and the label was
// reused by a stranger. Known-but-offline id → held (P1), never misdelivered.
const fr = routing.enqueueRouted(F, { id: "f1", from: "peerF", text: "for the old one", fromSessionUuid: convOld });
expect("label reuse: a shared id whose owner is gone is NOT delivered to the reused label", fr.target.kind === "unrouted");
expect("reused codex:1 inbox did not receive the old thread", !existsSync(join(routing.sessionInboxDir(F, "codex:1"), "f1.json")));
spawnSync("sleep", ["0.05"]);
const fReap = routing.reapClosedTargets(F, { graceMs: 10 });
expect("old conversation reaps as closed (its session is truly gone)", fReap.length === 1 && fReap[0].id === "f1");

const failed = checks.filter((c) => !c.ok);
console.log("\n" + (failed.length === 0 ? `ALL ${checks.length} CHECKS PASSED ✅` : `${failed.length} FAILED ❌`));
process.exit(failed.length === 0 ? 0 : 1);
