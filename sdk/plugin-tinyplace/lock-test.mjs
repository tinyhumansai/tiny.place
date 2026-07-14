// Offline, deterministic test of the per-agent daemon lock (CAS):
// acquire/steal-stale/heartbeat/release, plus a real two-process race that must
// yield exactly one winner.
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync, mkdirSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
// Pin the codex adapter so daemonDir() resolves under TINYPLACE_CODEX_HOME.
process.env.TINYPLACE_HARNESS = "codex";
process.env.TINYPLACE_CODEX_HOME = mkdtempSync(join(tmpdir(), "tinyplace-lock-"));
delete process.env.TINYPLACE_DAEMON_LOCK_MS;
const lock = await import("./mcp/daemon-lock.mjs");
const outbox = await import("./mcp/outbox.mjs");

const checks = [];
const expect = (label, cond) => { checks.push({ label, ok: !!cond }); console.log((cond ? "PASS " : "FAIL ") + label); };

// A live foreign pid (a sleeper) and a dead pid.
const sleeper = spawn(process.execPath, ["-e", "setInterval(()=>{},1e9)"]);
const livePid = sleeper.pid;
const deadChild = spawn(process.execPath, ["-e", "setInterval(()=>{},1e9)"]);
const deadPid = deadChild.pid;
deadChild.kill("SIGKILL");
await new Promise((r) => deadChild.on("exit", r));

const now = () => new Date().toISOString();
function writeForeignLock(agent, pid, updatedAt) {
  const dir = dirname(lock.lockPath(agent));
  mkdirSync(dir, { recursive: true });
  writeFileSync(lock.lockPath(agent), JSON.stringify({ pid, wallet: "w", startedAt: updatedAt, updatedAt }));
}

// ── acquire on a free agent ──────────────────────────────────────────────────
const A = "AgentLock1111111111111111111111";
expect("acquire on free agent → true", lock.acquireLock(A, { wallet: "w" }) === true);
expect("re-acquire by same pid → true (idempotent)", lock.acquireLock(A, { wallet: "w" }) === true);
expect("daemonLive true after acquire", lock.daemonLive(A) === true);

// ── a live foreign owner blocks acquisition ──────────────────────────────────
const B = "AgentLock2222222222222222222222";
writeForeignLock(B, livePid, now());
expect("live foreign lock → daemonLive true", lock.daemonLive(B) === true);
expect("acquire when a live daemon owns it → false", lock.acquireLock(B, { wallet: "w" }) === false);

// ── a stale foreign lock is stolen ───────────────────────────────────────────
const C = "AgentLock3333333333333333333333";
writeForeignLock(C, deadPid, now()); // dead pid → stale regardless of heartbeat
expect("stale (dead pid) lock → daemonLive false", lock.daemonLive(C) === false);
expect("acquire steals a stale lock → true", lock.acquireLock(C, { wallet: "w" }) === true);
expect("we own C after stealing (daemonLive true)", lock.daemonLive(C) === true);

// stale by expired heartbeat (live pid but old timestamp)
const D = "AgentLock4444444444444444444444";
writeForeignLock(D, livePid, new Date(Date.now() - 120000).toISOString());
expect("expired-heartbeat lock → not live", lock.daemonLive(D) === false);
expect("acquire steals expired-heartbeat lock → true", lock.acquireLock(D, { wallet: "w" }) === true);

// ── heartbeat / release ──────────────────────────────────────────────────────
expect("heartbeat our own lock → true", lock.heartbeatLock(A, { wallet: "w" }) === true);
writeForeignLock(A, livePid, now()); // a live foreigner takes over A
expect("heartbeat after foreign takeover → false (stand down)", lock.heartbeatLock(A, { wallet: "w" }) === false);
// release only removes our own lock; A is now foreign-owned, so release is a no-op
lock.releaseLock(A);
expect("release does not remove a foreign-owned lock", existsSync(lock.lockPath(A)) === true);

// ── two-process race: exactly one winner ─────────────────────────────────────
const raceAgent = "AgentRace555555555555555555555";
const racer = `
  process.env.TINYPLACE_HARNESS = "codex";
  process.env.TINYPLACE_CODEX_HOME = ${JSON.stringify(process.env.TINYPLACE_CODEX_HOME)};
  const lock = await import(${JSON.stringify(join(here, "mcp", "daemon-lock.mjs"))});
  const won = lock.acquireLock(${JSON.stringify(raceAgent)}, { wallet: "w" });
  // hold the lock a moment so the loser can't see it as stale
  if (won) await new Promise((r) => setTimeout(r, 300));
  process.stdout.write(won ? "WIN" : "LOSE");
`;
function runRacer() {
  return new Promise((resolve) => {
    const c = spawn(process.execPath, ["--input-type=module", "-e", racer], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    c.stdout.on("data", (d) => (out += d.toString()));
    c.on("close", () => resolve(out.trim())); // 'close' = stdout fully flushed
  });
}
const results = await Promise.all([runRacer(), runRacer(), runRacer()]);
const wins = results.filter((r) => r === "WIN").length;
expect("3-way race → exactly one WIN", wins === 1);

// ── stale-steal race: concurrent stealers of one stale lock → one winner ──────
function runStealRacer(agent) {
  const src = `
    process.env.TINYPLACE_HARNESS = "codex";
    process.env.TINYPLACE_CODEX_HOME = ${JSON.stringify(process.env.TINYPLACE_CODEX_HOME)};
    const lock = await import(${JSON.stringify(join(here, "mcp", "daemon-lock.mjs"))});
    const won = lock.acquireLock(${JSON.stringify(agent)}, { wallet: "w" });
    if (won) await new Promise((r) => setTimeout(r, 300));
    process.stdout.write(won ? "WIN" : "LOSE");
  `;
  return new Promise((resolve) => {
    const c = spawn(process.execPath, ["--input-type=module", "-e", src], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    c.stdout.on("data", (d) => (out += d.toString()));
    c.on("close", () => resolve(out.trim())); // 'close' = stdout fully flushed
  });
}
const staleAgent = "AgentStaleRace666666666666666";
writeForeignLock(staleAgent, deadPid, now()); // a stale lock all racers must steal
const stealResults = await Promise.all([runStealRacer(staleAgent), runStealRacer(staleAgent), runStealRacer(staleAgent)]);
expect("3-way stale-steal race → exactly one WIN", stealResults.filter((r) => r === "WIN").length === 1);

// ── outbox stale-claim recovery: skip a still-alive owner, reclaim a dead one ──
// The claim name carries the owner daemon's pid. A live owner may have a send in
// flight, so its claim must NOT be reclaimed (double-send); a dead owner's claim
// is orphaned and must be requeued.
{
  const AO = "AgentOutbox7777777777777777777";
  const dir = outbox.outboxDir(AO);
  mkdirSync(dir, { recursive: true });
  const job = (id) => JSON.stringify({ id, to: "PeerZ", text: "hi" }) + "\n";
  const liveClaim = join(dir, `.sending-${livePid}-jobLive.json`);
  writeFileSync(liveClaim, job("jobLive"));
  writeFileSync(join(dir, `.sending-${deadPid}-jobDead.json`), job("jobDead"));

  const claimed = outbox.claimOutboxJobs(AO);
  expect("outbox reclaims exactly the dead owner's job", claimed.length === 1 && claimed[0].job.id === "jobDead");
  expect("outbox leaves the live owner's in-flight claim untouched", existsSync(liveClaim) === true);
  claimed.forEach((c) => c.done());
}

// ── outbox unknown-owner (unparseable) claim: age-gated requeue under real name ──
// An old-format/corrupt claim like `.sending-<job>.json` has no owner pid. It must
// requeue only past the age gate, and must be restored to its ORIGINAL name — the
// generic `.sending-` prefix has to be stripped (else it renames to itself and is
// silently dropped).
{
  const AO2 = "AgentOutbox8888888888888888888";
  const dir = outbox.outboxDir(AO2);
  mkdirSync(dir, { recursive: true });
  const staleClaim = join(dir, ".sending-staleUnknown.json");
  writeFileSync(staleClaim, JSON.stringify({ id: "staleUnknown", to: "PeerZ", text: "hi" }) + "\n");
  const old = new Date(Date.now() - 120000); // backdate past STALE_CLAIM_MS (60s)
  utimesSync(staleClaim, old, old);

  const claimed = outbox.claimOutboxJobs(AO2);
  expect("outbox requeues an aged unknown-owner claim under its original name", claimed.length === 1 && claimed[0].job.id === "staleUnknown");
  expect("outbox stripped the .sending- prefix (not a rename-to-self)", existsSync(staleClaim) === false);
  claimed.forEach((c) => c.done());
}

// a FRESH unknown-owner claim is left alone (age gate protects an in-flight send)
{
  const AO3 = "AgentOutbox9999999999999999999";
  const dir = outbox.outboxDir(AO3);
  mkdirSync(dir, { recursive: true });
  const freshClaim = join(dir, ".sending-freshUnknown.json");
  writeFileSync(freshClaim, JSON.stringify({ id: "freshUnknown", to: "PeerZ", text: "hi" }) + "\n");

  const claimed = outbox.claimOutboxJobs(AO3);
  expect("outbox leaves a fresh unknown-owner claim untouched (age gate)", claimed.length === 0 && existsSync(freshClaim) === true);
}

sleeper.kill("SIGKILL");

const failed = checks.filter((c) => !c.ok);
console.log("\n" + (failed.length === 0 ? `ALL ${checks.length} CHECKS PASSED ✅` : `${failed.length} FAILED ❌`));
process.exit(failed.length === 0 ? 0 : 1);
