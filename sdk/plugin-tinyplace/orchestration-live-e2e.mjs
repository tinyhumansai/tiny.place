#!/usr/bin/env node
// End-to-end orchestration proof — the WHOLE tiny.place coding-agent pipe, with a
// mocked LLM and NO real terminal, against a real backend.
//
// A "human" peer (alice, a plain SDK client) sets up a connection and sends a
// message to a coding agent (bob) that runs entirely through plugin-tinyplace with
// the `mock` harness. The real per-agent daemon drains the relay, decrypts once
// (it owns the Signal ratchet), routes the DM to the headless autoresponder, which
// spawns the MOCK responder (adapters/mock.mjs → test/mock-responder.mjs) in place
// of `claude -p` / `codex exec`. The mock composes a deterministic reply and drops
// it in the outbox; the daemon encrypts + sends it back. Alice decrypts it.
//
// This exercises the real code paths — drain → decodeBody → route → dispatch →
// respond-batch → responder → outbox → drainOutbound → sendMessage — mocking only
// the model. It is the plugin-side counterpart to scripts/e2e-a2a-live-stream.mjs.
//
// Prereqs: a backend at API_URL (default http://localhost:8080) and the local TS
// SDK linked into this plugin (the script self-links if missing — see ensureSdkLink).
//
// Usage:  node orchestration-live-e2e.mjs      (API_URL overrides the backend)
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const API_URL = process.env.API_URL ?? process.env.TINYPLACE_API_URL ?? "http://localhost:8080";

const log = (m) => console.log(`\x1b[34m[i]\x1b[0m ${m}`);
const ok = (m) => console.log(`\x1b[32m[✓]\x1b[0m ${m}`);
const fail = (m) => {
  console.error(`\x1b[31m[✗]\x1b[0m ${m}`);
  process.exitCode = 1;
};
const assert = (cond, m) => (cond ? ok(m) : fail(m));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hex = (u8) => Buffer.from(u8).toString("hex");

// The plugin is a standalone package (excluded from the pnpm workspace), so the
// daemon's `@tinyhumansai/tinyplace` import isn't auto-linked. Link the local built
// SDK so both this script and the spawned daemon resolve the SAME v2 SDK.
function ensureSdkLink() {
  const dest = join(HERE, "node_modules", "@tinyhumansai", "tinyplace");
  if (existsSync(dest)) return;
  mkdirSync(dirname(dest), { recursive: true });
  try {
    symlinkSync(join("..", "..", "..", "typescript"), dest);
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
  }
}

async function main() {
  ensureSdkLink();
  const { TinyPlaceClient, LocalSigner, SignalSession, MemorySessionStore, generateSignedPreKey, generatePreKeys, serializeSignedKey, serializePreKey, ed25519PubToX25519Pub } =
    await import("@tinyhumansai/tinyplace");

  log(`backend ${API_URL}`);

  // ── isolated environment (wallet store + mock harness data dir) ─────────────
  const root = mkdtempSync(join(tmpdir(), "tp-orch-e2e-"));
  const HOME_DIR = join(root, "home"); // TINYPLACE_HOME — shared wallet store
  const MOCK_DIR = join(root, "mock"); // TINYPLACE_MOCK_HOME — harness data dir
  mkdirSync(HOME_DIR, { recursive: true });
  mkdirSync(MOCK_DIR, { recursive: true });

  // ── bob: the coding agent driven through the mock harness ───────────────────
  const bobSeed = randomBytes(32);
  const bobSigner = await LocalSigner.fromSeed(new Uint8Array(bobSeed));
  const bob = bobSigner.agentId;
  writeFileSync(
    join(HOME_DIR, "wallets.json"),
    JSON.stringify({ wallets: [{ name: "bob", address: bob, secretKey: hex(bobSeed) }] }, null, 2) + "\n",
    { mode: 0o600 },
  );

  // ── alice: the "human" peer, a plain SDK client ─────────────────────────────
  const aliceSigner = await LocalSigner.generate();
  const alice = aliceSigner.agentId;
  const aliceClient = new TinyPlaceClient({ baseUrl: API_URL, signer: aliceSigner });
  const bobSetup = new TinyPlaceClient({ baseUrl: API_URL, signer: bobSigner }); // contacts only — NOT the ratchet owner
  log(`agent(bob)=${bob.slice(0, 8)}…  human(alice)=${alice.slice(0, 8)}…`);

  // ── start bob's daemon under the mock harness ───────────────────────────────
  const daemonEnv = {
    ...process.env,
    TINYPLACE_HARNESS: "mock",
    TINYPLACE_DAEMON_WALLET: "bob",
    TINYPLACE_HOME: HOME_DIR,
    TINYPLACE_MOCK_HOME: MOCK_DIR,
    TINYPLACE_API_URL: API_URL,
    TINYPLACE_DAEMON_POLL_MS: "800",
    TINYPLACE_DAEMON_HEARTBEAT_MS: "5000",
    TINYPLACE_DAEMON_IDLE_MS: "120000", // don't idle-exit mid-test (no live sessions by design)
    TINYPLACE_MOCK_REPLY_PREFIX: "MOCK-AGENT-REPLY",
  };
  const daemon = spawn("node", [join(HERE, "hooks", "agent-daemon.mjs")], { env: daemonEnv, stdio: ["ignore", "pipe", "pipe"] });
  let daemonLog = "";
  daemon.stdout.on("data", (d) => (daemonLog += d));
  daemon.stderr.on("data", (d) => (daemonLog += d));
  const stopDaemon = () => { try { daemon.kill("SIGTERM"); } catch { /* ignore */ } };

  // A COMPLETE bundle needs both the signed pre-key and a one-time pre-key. The
  // daemon publishes them in two separate calls (rotateSignedPreKey then
  // uploadPreKeys), so fetch until both are present — otherwise a half-published
  // bundle yields an X3DH the daemon can't complete, and the DM is silently dropped.
  const fetchCompleteBundle = async (timeoutMs) => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const b = await aliceClient.keys.getBundle(bob).catch(() => null);
      if (b?.signedPreKey?.publicKey && b?.oneTimePreKey?.publicKey) return b;
      if (Date.now() > deadline) return null;
      await sleep(500);
    }
  };

  try {
    // The daemon publishes bob's Signal keys on startup — wait for a complete bundle.
    let bundle = await fetchCompleteBundle(25_000);
    assert(!!bundle, "bob's daemon came up and published a complete Signal key bundle");
    if (!bundle) throw new Error("daemon never published a complete key bundle");

    // ── HUMAN FLOW step 1: set up a connection (mutual contact) ───────────────
    await aliceClient.contacts.request(bob);
    await bobSetup.contacts.accept(alice); // the agent's operator accepts the connection
    assert((await aliceClient.contacts.status(bob)).status === "accepted", "connection established (alice ⇄ bob are contacts)");

    // ── HUMAN FLOW step 2: send a message to the agent ────────────────────────
    const aliceX25519 = await aliceSigner.getX25519KeyPair();
    const bobX25519Pub = ed25519PubToX25519Pub(bobSigner.publicKey);
    const question = "Hello agent, please acknowledge this message.";
    // Messaging addresses are the base64 Ed25519 key, NOT the base58 agentId: the
    // recipient derives the sender's X25519 via fromBase64(from), so a base58 `from`
    // yields the wrong key and the DM fails to decrypt (dropped).
    let aliceSignal;
    let sent = false;
    for (let attempt = 1; attempt <= 5 && !sent; attempt++) {
      // Fresh session + complete bundle per attempt so a retry re-runs X3DH with a
      // new ephemeral (and thus different ciphertext).
      aliceSignal = new SignalSession(new MemorySessionStore(aliceX25519), aliceX25519.publicKey);
      bundle = (await fetchCompleteBundle(10_000)) ?? bundle;
      const encrypted = await aliceSignal.encrypt(bobSigner.publicKeyBase64, bobX25519Pub, new TextEncoder().encode(question), bundle, bobSigner.publicKey);
      try {
        await aliceClient.messages.send({
          id: `human-${Date.now()}-${attempt}`,
          from: aliceSigner.publicKeyBase64,
          to: bobSigner.publicKeyBase64,
          timestamp: new Date().toISOString(),
          body: encrypted.body,
          type: encrypted.type,
          deviceId: 1,
          signal: encrypted.signal,
        });
        sent = true;
      } catch (e) {
        // The relay's `looksLikeJSON` guard false-positives on the ~1% of random
        // ciphertext whose first byte is `{`/`[`, rejecting a valid encrypted body.
        // Re-encrypt (fresh ephemeral) and retry; surface anything else.
        if (e?.status === 400 && /ciphertext/i.test(String(e?.body?.error ?? ""))) continue;
        fail(`send failed: HTTP ${e?.status} ${JSON.stringify(e?.body)}`);
        throw e;
      }
    }
    assert(sent, "human sent an encrypted DM to the agent");
    if (!sent) throw new Error("send never succeeded");

    // ── ORCHESTRATION: daemon drains → routes → mock LLM → replies ────────────
    // Poll alice's mailbox for the agent's reply and decrypt it.
    const aliceX25519Pub = ed25519PubToX25519Pub(aliceSigner.publicKey);
    let replyText = null;
    let replyEnvelope = null;
    for (let i = 0; i < 60 && replyText === null; i++) {
      const { messages } = await aliceClient.messages.list(alice).catch(() => ({ messages: [] }));
      for (const m of messages ?? []) {
        if (m.from === alice) continue;
        try {
          const plaintext = await aliceSignal.decrypt(bobSigner.publicKeyBase64, bobX25519Pub, m);
          const decoded = new TextDecoder().decode(plaintext);
          // The daemon replies with a SessionEnvelope; the human text is message.text.
          const text = (() => { try { return JSON.parse(decoded)?.message?.text ?? decoded; } catch { return decoded; } })();
          replyText = text;
          replyEnvelope = m;
          break;
        } catch { /* not for this session / already consumed */ }
      }
      if (replyText === null) await sleep(500);
    }

    assert(replyText !== null, "agent orchestrated a reply back to the human (full round trip)");
    if (replyText !== null) {
      assert(replyText.startsWith("MOCK-AGENT-REPLY"), `reply came from the mock LLM responder (got: ${JSON.stringify(replyText).slice(0, 80)})`);
      assert(replyText.includes("acknowledge this message"), "the mock LLM saw and echoed the human's message content");
    }
    if (replyEnvelope) {
      assert(!JSON.stringify(replyEnvelope).includes("MOCK-AGENT-REPLY"), "relay only ever stored ciphertext (server never saw the reply plaintext)");
    }

    if (process.exitCode) {
      log("--- daemon log (last 1500 chars) ---");
      console.log(daemonLog.slice(-1500));
    }
  } finally {
    stopDaemon();
    await sleep(200);
    try { await bobSetup.directory?.deleteAgent?.(bob); } catch { /* best-effort */ }
    if (process.env.TP_E2E_KEEP === "1") {
      log(`KEEP: state preserved at ${root} (HOME=${HOME_DIR} MOCK=${MOCK_DIR})`);
    } else {
      try { rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ }
    }
  }

  if (process.exitCode) fail("ORCHESTRATION E2E FAILED");
  else ok("ORCHESTRATION E2E PASSED (human → agent(mock LLM) → human, full round trip)");
}

main().catch((e) => {
  fail(`unexpected error: ${e?.stack ?? e}`);
  process.exit(1);
});
