// Shared wiring for the Cursor⇄OpenHuman bidirectional bridge prototype.
// Uses the built TypeScript SDK (sdk/typescript/dist) directly — it must be
// >= 2.0.2, which fetches peer bundles by base58 cryptoId; older builds fetch by
// the base64 key and 404 on any key containing "/". Build it first:
// `pnpm --filter @tinyhumansai/tinyplace build`. The dist path is resolved
// relative to THIS file (repo-portable, cwd-independent); override TINYPLACE_SDK_DIST.
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmdirSync,
  existsSync,
  statSync,
  appendFileSync,
} from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
// prototype/cursor-bridge/ -> ../../../typescript/dist
const DIST =
  process.env.TINYPLACE_SDK_DIST ?? resolve(HERE, "../../../typescript/dist");
const { TinyPlaceClient, LocalSigner } = await import(`${DIST}/index.js`);
const { FileSessionStore } = await import(`${DIST}/node/index.js`);
const agent = await import(`${DIST}/agent/index.js`);

export const API =
  process.env.TINYPLACE_API_URL ?? "https://staging-api.tiny.place";
// The OpenHuman app's tiny.place address (its base58 cryptoId). REQUIRED — set it
// in the wrapper/env; there is no default (it's per-install). See README.
export const OPENHUMAN = process.env.OPENHUMAN_ADDR ?? "";
export const HOME =
  process.env.BRIDGE_HOME ?? join(homedir(), ".tinyplace-cursorbridge");
export const LOG = process.env.BRIDGE_LOG ?? "/tmp/cursor-bridge.log";

export const log = (m) => {
  try {
    appendFileSync(LOG, `${new Date().toISOString()} ${m}\n`);
  } catch {}
};

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// OpenHuman sends its replies as a SessionEnvelopeV1 JSON body (role "owner").
// Pull the human-readable text out; fall back to the raw string for plain DMs.
export function extractText(raw) {
  try {
    const o = JSON.parse(raw);
    if (
      o &&
      o.envelope_version &&
      o.message &&
      typeof o.message.text === "string"
    ) {
      return o.message.text;
    }
  } catch {
    /* plain DM */
  }
  return raw;
}

// Flag file the approval hook sets while it waits for an OpenHuman allow/deny, so
// the reverse daemon PAUSES inbox draining (the hook must be the sole reader then,
// or it would race the daemon for the decision DM).
export const AWAITING = join(HOME, ".awaiting-approval");

// ── cross-process mutex ──────────────────────────────────────────────────────
// The daemon (reverse: reads inbox) and the hook processes (forward: send) both
// touch the SAME FileSessionStore. Concurrent read+write corrupts the Double
// Ratchet state → the relay rejects the next send with HTTP 400. Serialize every
// SDK op that hits the store behind an atomic mkdir lock (works across processes).
const LOCKDIR = join(HOME, ".session.lock");
const LOCK_STALE_MS = 15000;

export async function withLock(fn, { retries = 200, delayMs = 40 } = {}) {
  mkdirSync(HOME, { recursive: true });
  for (let i = 0; i < retries; i++) {
    try {
      mkdirSync(LOCKDIR); // atomic: throws EEXIST if held
      try {
        return await fn();
      } finally {
        try {
          rmdirSync(LOCKDIR);
        } catch {}
      }
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      // Break a stale lock left by a crashed process.
      try {
        if (Date.now() - statSync(LOCKDIR).mtimeMs > LOCK_STALE_MS) {
          rmdirSync(LOCKDIR);
          continue;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  // Give up waiting — proceed unlocked rather than drop the message.
  return await fn();
}

const bytesToHex = (b) =>
  Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const hexToBytes = (h) => {
  const o = new Uint8Array(h.length / 2);
  for (let i = 0; i < o.length; i++)
    o[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return o;
};

// Load or mint a stable 32-byte seed for the bridge identity.
export function loadOrCreateSeed() {
  mkdirSync(HOME, { recursive: true });
  const p = join(HOME, "wallet.json");
  if (existsSync(p)) return JSON.parse(readFileSync(p, "utf8")).seedHex;
  const seed = new Uint8Array(32);
  globalThis.crypto.getRandomValues(seed);
  const seedHex = bytesToHex(seed);
  writeFileSync(p, JSON.stringify({ seedHex }, null, 2), { mode: 0o600 });
  return seedHex;
}

// Build a client + signer with the Signal session store the bridge shares across
// all hook invocations (each hook is a fresh process; the store is on disk).
export async function build() {
  const seedHex = loadOrCreateSeed();
  const signer = await LocalSigner.fromSeed(hexToBytes(seedHex));
  const storePath = FileSessionStore.defaultPath(
    signer.publicKeyBase64,
    join(HOME, "signal"),
  );
  const store = new FileSessionStore(
    storePath,
    await signer.getX25519KeyPair(),
  );
  const client = new TinyPlaceClient({
    baseUrl: API,
    signer,
    encryption: { store },
  });
  return { signer, client, agent, store };
}

// Send with self-healing: on an encryption/session error (the intermittent
// "body must be encrypted ciphertext" 400 or a ratchet desync), drop the stale
// session with the recipient and retry once so a fresh X3DH re-establishes it.
// Prevents a single desynced message from silently dropping a forwarded reply.
export async function sendWithRetry(ctx, recipient, body) {
  const { client, signer, agent, store } = ctx;
  try {
    return await agent.sendMessage(client, signer, recipient, body);
  } catch (e) {
    if (
      !/encrypted ciphertext|HTTP 400|No session|ratchet|decrypt/i.test(
        String(e?.message),
      )
    ) {
      throw e;
    }
    try {
      const to = await agent.resolveRecipientKey(client, recipient);
      await store.removeSession(to);
    } catch {
      /* best-effort reset */
    }
    return await agent.sendMessage(client, signer, recipient, body);
  }
}

// ── echo suppression ──────────────────────────────────────────────────────────
// The daemon pastes OpenHuman messages into Cursor as PLAIN text (no visible tag),
// so beforeSubmitPrompt can't tell a pushed message from a user-typed one by
// content alone. Instead the daemon records each push here; the hook consumes the
// record to skip forwarding that one submission back to OpenHuman (which already
// has it). Match is by trimmed text within a short TTL, consumed once.
const PUSHED = join(HOME, "pushed.json");
const PUSH_TTL_MS = 30000;

function readPushed() {
  try {
    return JSON.parse(readFileSync(PUSHED, "utf8"));
  } catch {
    return [];
  }
}

export function recordPush(text) {
  const arr = readPushed()
    .filter((e) => Date.now() - e.ts < PUSH_TTL_MS)
    .concat([{ text: String(text).trim(), ts: Date.now() }])
    .slice(-20);
  try {
    writeFileSync(PUSHED, JSON.stringify(arr), { mode: 0o600 });
  } catch {}
}

// Returns true (and removes the record) if `text` matches a recent push.
export function consumePush(text) {
  const arr = readPushed();
  const t = String(text).trim();
  const i = arr.findIndex(
    (e) => e.text === t && Date.now() - e.ts < PUSH_TTL_MS,
  );
  if (i === -1) return false;
  arr.splice(i, 1);
  try {
    writeFileSync(PUSHED, JSON.stringify(arr), { mode: 0o600 });
  } catch {}
  return true;
}

// SessionEnvelopeV1 body so OpenHuman's orchestration ingest classifies this as a
// `cursor` runtime and renders it under a Cursor session (harness_type_for).
export function envelope({ role, text, convId, cwd }) {
  const sid = convId || "cursor-session";
  return JSON.stringify({
    envelope_version: "tinyplace.harness.session.v1",
    version: 1,
    scope: {
      type: "session",
      key: "cursor",
      cwd: cwd || "",
      wrapper_session_id: sid,
      harness_session_id: sid,
    },
    harness: { provider: "cursor", command: "cursor", argv: [] },
    message: {
      id: `${sid}-${Date.now()}`,
      line: Date.now(),
      role,
      text,
      timestamp: new Date().toISOString(),
    },
    source: { path: "cursor", record_type: role },
  });
}

// SessionEnvelopeV2 with a typed `approval_request` event. OpenHuman's orchestration
// ingest (classify_v2) maps this to eventKind "approval_request" (display → body,
// tool_name, call_id) and the SessionTranscript renders an Allow/Deny card. Uses the
// SAME wrapper_session_id as the chat turns so it threads into the same session; the
// user's button reply comes back as a plain "allow"/"deny" DM.
export function approvalEnvelope({
  toolName,
  display,
  convId,
  cwd,
  requestId,
}) {
  const sid = convId || "cursor-session";
  return JSON.stringify({
    envelope_version: "tinyplace.harness.session.v2",
    version: 2,
    scope: {
      type: "session",
      key: "cursor",
      cwd: cwd || "",
      wrapper_session_id: sid,
      harness_session_id: sid,
    },
    harness: { provider: "cursor", command: "cursor", argv: [] },
    event: {
      id: requestId,
      seq: Date.now(),
      ts: new Date().toISOString(),
      role: "agent",
      kind: "approval_request",
      payload: {
        tool_name: toolName || "shell",
        display: display || "",
        call_id: requestId,
      },
    },
    source: { path: "cursor", record_type: "approval_request" },
  });
}
