// Offline, deterministic test of the session_info emit core (mcp/session-info.mjs):
// owner-address gating, the SessionEnvelopeV2 builder (byte-shape + stable id),
// the emit planner (fresh / resumed / skip), the per-agent emitted store, and the
// git-info/title helpers. No network, no MCP server, no daemon — pure functions.
//
// Runs under the mock adapter (TINYPLACE_HARNESS=mock) with a throwaway data dir
// so the store round-trip touches only a temp directory.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { join } from "node:path";

process.env.TINYPLACE_HARNESS = "mock";
const DATA_DIR = mkdtempSync(join(tmpdir(), "tp-session-info-"));
process.env.TINYPLACE_MOCK_HOME = DATA_DIR;

const {
  SESSION_ENVELOPE_VERSION_V2,
  SESSION_INFO_RECORD_TYPE,
  DEFAULT_CAPABILITIES,
  ownerAddress,
  buildSessionInfoEnvelope,
  stableEventId,
  planSessionInfoEmit,
  loadEmitted,
  persistEmitted,
  repoSlugFromRemote,
  sessionTitle,
  gitInfo,
} = await import("./mcp/session-info.mjs");

const checks = [];
const expect = (label, cond) => {
  checks.push({ label, ok: !!cond });
  console.log((cond ? "PASS " : "FAIL ") + label);
};

// 1. ownerAddress: env-gated, trimmed, unset → null (feature off).
expect("ownerAddress: unset → null (feature off)", ownerAddress({}) === null);
expect("ownerAddress: blank/whitespace → null", ownerAddress({ TINYPLACE_OWNER_ADDRESS: "   " }) === null);
expect("ownerAddress: trims the configured value", ownerAddress({ TINYPLACE_OWNER_ADDRESS: "  Master123  " }) === "Master123");

// 2. buildSessionInfoEnvelope: full v2 frame + typed session_info event.
const CONV = "11111111-2222-3333-4444-555555555555";
const body = buildSessionInfoEnvelope({
  agentAddress: "ELQUJvq27tYx",
  wrapperSessionId: CONV,
  harnessSessionId: "hsid-xyz",
  cwd: "/work/myrepo",
  label: "mock:1",
  handle: "@alice",
  title: "myrepo · feat/x",
  repo: "org/myrepo",
  branch: "feat/x",
  model: "claude-opus-4-8",
  harnessVersion: "1.4.2",
  capabilities: DEFAULT_CAPABILITIES,
  resumed: false,
  seq: 0,
  startedAt: "2026-07-07T10:34:12.000Z",
});
const env = JSON.parse(body);
expect("envelope_version is the v2 schema", env.envelope_version === SESSION_ENVELOPE_VERSION_V2);
expect("version === 2", env.version === 2);
expect("valid v2 shape: bucket/scope/harness/event/source present", !!env.bucket && !!env.scope && !!env.harness && !!env.event && !!env.source);
expect("scope carries the wrapper/harness session ids + cwd", env.scope.wrapper_session_id === CONV && env.scope.harness_session_id === "hsid-xyz" && env.scope.cwd === "/work/myrepo");
expect("scope.type === session", env.scope.type === "session");
expect("harness.provider stamped from the active (mock) adapter", env.harness.provider === "mock" && env.harness.command === "tinyplace-mock");
expect("event.kind === session_info, role === agent", env.event.kind === "session_info" && env.event.role === "agent");
expect("event.seq === 0", env.event.seq === 0);
expect("event.model rides on the frame when provided", env.event.model === "claude-opus-4-8");
expect("source.record_type === hook:SessionStart", env.source.record_type === SESSION_INFO_RECORD_TYPE);
const p = env.event.payload;
expect("payload.agent_address confirms identity", p.agent_address === "ELQUJvq27tYx");
expect("payload optionals (handle/title/repo/branch/model/harness_version) carried", p.handle === "@alice" && p.title === "myrepo · feat/x" && p.repo === "org/myrepo" && p.branch === "feat/x" && p.model === "claude-opus-4-8" && p.harness_version === "1.4.2");
expect("payload.capabilities is the advertised kind list", Array.isArray(p.capabilities) && p.capabilities.includes("tool_call") && !p.capabilities.includes("session_info"));
expect("payload.resumed === false (fresh spawn)", p.resumed === false);
expect("payload.started_at is the ISO session start", p.started_at === "2026-07-07T10:34:12.000Z");

// 3. Stable id: matches the SDK algorithm; idempotent per seq; distinct per seq.
const NUL = String.fromCharCode(0);
const expectedId = createHash("sha256").update([CONV, SESSION_INFO_RECORD_TYPE, 0, "session_info"].join(NUL)).digest("hex");
expect("event.id matches sha256(wrapper\\0record\\0seq\\0kind)", env.event.id === expectedId);
expect("stableEventId helper agrees with the built id", stableEventId(CONV, SESSION_INFO_RECORD_TYPE, 0, "session_info") === env.event.id);
const resumedBody = JSON.parse(buildSessionInfoEnvelope({ agentAddress: "ELQUJvq27tYx", wrapperSessionId: CONV, resumed: true, seq: 1 }));
expect("resumed re-emit (seq 1) → distinct id (upsert, not dedup-drop)", resumedBody.event.id !== env.event.id);
expect("resumed re-emit sets payload.resumed === true", resumedBody.event.payload.resumed === true);
const again = JSON.parse(buildSessionInfoEnvelope({ agentAddress: "ELQUJvq27tYx", wrapperSessionId: CONV, resumed: false, seq: 0 }));
expect("same (wrapper, seq) → same id (idempotent retry)", again.event.id === env.event.id);

// 4. Optional payload fields are OMITTED (not null) when empty — matches the SDK `?:`.
const minimal = JSON.parse(buildSessionInfoEnvelope({ agentAddress: "Addr", wrapperSessionId: CONV, resumed: false, seq: 0 }));
expect("minimal: no handle/title/repo/branch/model/harness_version keys", !("handle" in minimal.event.payload) && !("title" in minimal.event.payload) && !("repo" in minimal.event.payload) && !("branch" in minimal.event.payload) && !("model" in minimal.event.payload) && !("harness_version" in minimal.event.payload));
expect("minimal: no event.model when omitted", !("model" in minimal.event));
expect("minimal: capabilities defaults to DEFAULT_CAPABILITIES", minimal.event.payload.capabilities.length === DEFAULT_CAPABILITIES.length);
expect("minimal: required agent_address/resumed/started_at always present", minimal.event.payload.agent_address === "Addr" && minimal.event.payload.resumed === false && typeof minimal.event.payload.started_at === "string");

// 5. planSessionInfoEmit: fresh vs resumed vs already-sent.
const plan1 = planSessionInfoEmit({ liveSessionUuids: ["a", "b", "c"], priorEmitted: new Set(["b"]), sentThisRun: new Set(["c"]) });
expect("planner emits fresh + resumed, skips already-sent-this-run", plan1.length === 2);
expect("planner: unseen session → resumed:false, seq 0", plan1.find((e) => e.sessionUuid === "a")?.resumed === false && plan1.find((e) => e.sessionUuid === "a")?.seq === 0);
expect("planner: prior-run session → resumed:true, seq 1", plan1.find((e) => e.sessionUuid === "b")?.resumed === true && plan1.find((e) => e.sessionUuid === "b")?.seq === 1);
expect("planner: session sent this run is skipped", !plan1.some((e) => e.sessionUuid === "c"));
const plan2 = planSessionInfoEmit({ liveSessionUuids: ["a", "a", "", null], priorEmitted: new Set(), sentThisRun: new Set() });
expect("planner dedups repeated ids and drops empties", plan2.length === 1 && plan2[0].sessionUuid === "a");
expect("planner tolerates array (not Set) inputs", planSessionInfoEmit({ liveSessionUuids: ["x"], priorEmitted: ["x"], sentThisRun: [] })[0].resumed === true);

// 6. Emitted store: round-trips through the temp data dir; survives a reload.
const AGENT = "Agent-Store-Test";
expect("loadEmitted: empty before any persist", loadEmitted(AGENT).size === 0);
persistEmitted(AGENT, new Set(["s1", "s2"]));
const reloaded = loadEmitted(AGENT);
expect("persist→load round-trips the announced set", reloaded.has("s1") && reloaded.has("s2") && reloaded.size === 2);
persistEmitted(AGENT, ["s3"]); // accepts an array too
expect("persist overwrites with the latest set", loadEmitted(AGENT).has("s3") && loadEmitted(AGENT).size === 1);
expect("store is per-agent (a different agent is empty)", loadEmitted("Other-Agent").size === 0);

// 7. repoSlugFromRemote: ssh + https + trailing .git.
expect("repo slug: git@host:org/repo.git → org/repo", repoSlugFromRemote("git@github.com:org/repo.git") === "org/repo");
expect("repo slug: https://host/org/repo.git → org/repo", repoSlugFromRemote("https://github.com/org/repo.git") === "org/repo");
expect("repo slug: no .git suffix", repoSlugFromRemote("https://github.com/org/repo") === "org/repo");
expect("repo slug: unparseable → null", repoSlugFromRemote("not-a-url") === null && repoSlugFromRemote("") === null);

// 8. sessionTitle: prefers repo/cwd basename + branch, falls back to label.
expect("title: repo + branch", sessionTitle({ repo: "org/myrepo", branch: "feat/x" }) === "myrepo · feat/x");
expect("title: cwd basename when no repo", sessionTitle({ cwd: "/a/b/proj", branch: "main" }) === "proj · main");
expect("title: label fallback, no branch", sessionTitle({ label: "mock:1" }) === "mock:1");

// 9. gitInfo: best-effort against THIS repo (a real git checkout) yields a branch;
//    a non-repo path yields nulls without throwing.
const here = await gitInfo(process.cwd());
expect("gitInfo: resolves a branch in a real repo", typeof here.branch === "string" && here.branch.length > 0);
const nonRepo = await gitInfo("/");
expect("gitInfo: non-repo path → nulls, no throw", nonRepo.repo === null && nonRepo.branch === null);

rmSync(DATA_DIR, { recursive: true, force: true });
const failed = checks.filter((c) => !c.ok);
console.log("\n" + (failed.length === 0 ? `ALL ${checks.length} CHECKS PASSED ✅` : `${failed.length} FAILED ❌`));
process.exit(failed.length === 0 ? 0 : 1);
