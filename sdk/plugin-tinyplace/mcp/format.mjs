// tiny.place plugin message format — pure encode/decode, no runtime/session state.
//
// New outbound bodies are a valid `SessionEnvelopeV1` (schema
// `tinyplace.harness.session.v1`, see sdk/typescript/src/types/harness.ts) plus
// a namespaced `tp` extension block: a plain harness-wrapper consumer can still
// read scope/message.role/message.text, while routing/correlation/auto-guard
// ride in `tp` (ignored by pure-envelope readers).
//
// decodeBody also understands the two pre-envelope body shapes so old peers,
// in-flight messages, and plain text keep working:
//   (a) SessionEnvelope JSON            → structured path
//   (b) AUTO_SENTINEL / re: sentinel    → legacy control header + plaintext
//   (c) anything else                   → plain text
//
// Kept as a standalone module (not an SDK import) so the plugin has no
// dependency on SDK type exports, and so it is unit-testable offline (§14).
//
// Harness-specific bits (session-id resolution, default label prefix, envelope
// harness.provider/command) are read from the active adapter — one code path,
// wired for whichever harness the plugin was installed into.
import { randomBytes } from "node:crypto";

import { activeAdapter } from "./harness.mjs";

// SessionEnvelope schema id (kept as a literal, mirrors SESSION_ENVELOPE_VERSION_V1).
export const SESSION_ENVELOPE_VERSION = "tinyplace.harness.session.v1";
export const PLUGIN_TP_VERSION = 1;

// ── legacy sentinels (pre-envelope) ─────────────────────────────────────────
// Prefixes an auto-reply so the recipient recognizes it and refuses to
// auto-respond back — the loop guard. Reply correlation embeds the answered id
// between SOH (\x01) delimiters right after the tag. Both live INSIDE the
// ciphertext; the relay only sees encrypted bytes. Built from char codes so the
// exact control bytes are preserved.
const SOH = String.fromCharCode(1);
export const AUTO_SENTINEL = SOH + "tp-auto" + SOH;
export const REPLY_OPEN = SOH + "re:";
export const REPLY_CLOSE = SOH;

// A session label is a short, token-like string (e.g. `codex:1`, `claude:1`,
// `reviewer`). Both from_session and to_session are ATTACKER-CONTROLLED free text
// pulled from the DM body, so we constrain them to this shape at decode time —
// downstream consumers (routing keys, the auto-responder's LLM prompt) then get
// values that are safe by construction. Anything outside the shape is dropped (null).
export const SAFE_LABEL_RE = /^[\w:-]{1,32}$/;
export function safeLabel(value) {
  return typeof value === "string" && SAFE_LABEL_RE.test(value) ? value : null;
}

// The durable session UUID binding key. Distinct from a label (which is short/
// positional) — a UUID is 36 chars, so it needs its own guard. Kept permissive
// enough for any RFC-4122 uuid while still constraining the (attacker-controlled)
// value to a safe hex/hyphen token.
export const SAFE_UUID_RE = /^[0-9a-fA-F-]{8,64}$/;
export function safeUuid(value) {
  return typeof value === "string" && SAFE_UUID_RE.test(value) ? value : null;
}

// §15 default: a plugin session's harness_session_id is the harness's own session
// id. Resolution is per-harness (Codex tries CODEX_SESSION_ID/THREAD_ID, Claude
// uses CLAUDE_CODE_SESSION_ID), so delegate to the active adapter; the MCP server
// self-generates a wrapper id when this is empty.
export function harnessSessionId() {
  return activeAdapter().resolveHarnessSessionId();
}

// Default session label used before the registry (Phase B) allocates one; an env
// override lets a session pin its label immediately. from_session = this label.
// The `<prefix>:1` default is harness-scoped (codex:1 / claude:1).
export function sessionLabel() {
  return process.env.TINYPLACE_SESSION_LABEL?.trim() || `${activeAdapter().sessionLabelPrefix}:1`;
}

export function newMessageId() {
  return "msg-" + randomBytes(9).toString("hex");
}

// The minute-window bucket a timestamp falls in (SessionEnvelope requires it).
function minuteBucket(date) {
  const start = new Date(date);
  start.setUTCSeconds(0, 0);
  const end = new Date(start.getTime() + 60_000);
  return { unit: "minute", start: start.toISOString(), end: end.toISOString() };
}

// Build a SessionEnvelope-superset JSON body for an outbound DM. `opts` carries
// the session context (fromSession label / harnessSessionId / agentAddress / cwd)
// plus the message fields (text, role, toSession, inReplyTo, auto).
export function encodeEnvelope(opts) {
  const now = new Date();
  const label = opts.fromSession || sessionLabel();
  const role = opts.role === "user" ? "user" : "agent";
  const adapter = activeAdapter();
  const envelope = {
    envelope_version: SESSION_ENVELOPE_VERSION,
    version: 1,
    bucket: minuteBucket(now),
    scope: {
      type: "session",
      key: `${opts.agentAddress ?? "agent"}:${label}`,
      cwd: opts.cwd ?? process.cwd(),
      // wrapper_session_id is a per-CONVERSATION id between two agents (a fresh uuid
      // per (session, peer) — see registry.resolveConversationUuid): peers can't
      // correlate our sessions across conversations, and a reply addressed to it
      // resolves back to the owning local session. Falls back to the harness/label id
      // for messages sent without a conversation context (e.g. system notices). The
      // short routing label rides in tp.from_session.
      wrapper_session_id: opts.conversationUuid || opts.harnessSessionId || harnessSessionId() || `${opts.agentAddress ?? "agent"}:${label}`,
      harness_session_id: opts.harnessSessionId ?? harnessSessionId(),
    },
    harness: { provider: adapter.provider, command: adapter.harness.command, argv: adapter.harness.argv ?? [] },
    message: {
      id: opts.messageId ?? newMessageId(),
      line: 0,
      role,
      text: String(opts.text ?? ""),
      timestamp: now.toISOString(),
    },
    source: { path: "plugin", record_type: "dm" },
    tp: { v: PLUGIN_TP_VERSION, from_session: label },
  };
  if (opts.toSession) envelope.tp.to_session = opts.toSession;
  // Single shared session id: every message — whoever sends it — carries exactly one
  // id, in scope.wrapper_session_id (the shared per-thread conversation id). A reply
  // REUSES the id of the thread it answers (see dispatchSend), so there is no separate
  // "peer session id" to echo. (Historically tp.to_session_uuid carried the peer's id
  // back; that dual-id addressing is gone — routing keys on wrapper_session_id alone.
  // tp.to_session above is an explicit label target, orthogonal to the session id.)
  if (opts.inReplyTo) envelope.tp.in_reply_to = opts.inReplyTo;
  if (opts.auto) envelope.tp.auto = true;
  return JSON.stringify(envelope);
}

// Like encodeEnvelope, but also returns the envelope's message.id — the
// in-body correlation id. Callers keep it to match a later reply's in_reply_to
// (works across the daemon file-queue transport, where the relay id isn't known
// synchronously).
export function buildEnvelope(opts) {
  const id = opts.messageId ?? newMessageId();
  return { id, body: encodeEnvelope({ ...opts, messageId: id }) };
}

// Decode a structured SessionEnvelope body → normalized message fields.
function decodeEnvelope(obj) {
  const tp = obj.tp && typeof obj.tp === "object" ? obj.tp : {};
  const text = typeof obj.message?.text === "string" ? obj.message.text : "";
  const role = obj.message?.role === "user" ? "user" : "agent";
  return {
    auto: tp.auto === true,
    inReplyTo: typeof tp.in_reply_to === "string" ? tp.in_reply_to : null,
    text,
    messageId: typeof obj.message?.id === "string" ? obj.message.id : null,
    // The routing label is tp.from_session; fall back to wrapper_session_id for
    // older bodies that stored the label there. Constrain the (attacker-
    // controlled) labels to a safe token shape so downstream use is safe.
    // A uuid in wrapper_session_id won't pass safeLabel (too long), so this legacy
    // fallback still only catches an OLD body that stored a short label there.
    fromSession: safeLabel(tp.from_session) ?? safeLabel(obj.scope?.wrapper_session_id),
    toSession: safeLabel(tp.to_session),
    // The single shared session id for the thread is scope.wrapper_session_id (a
    // uuid); a non-uuid there (e.g. a plain harness/label id) is dropped by safeUuid
    // → label routing. There is no separate peer-id field — one id per message.
    fromSessionUuid: safeUuid(obj.scope?.wrapper_session_id),
    role,
    envelope: true,
  };
}

// Legacy fallback: the pre-envelope AUTO_SENTINEL / re: sentinel header + plain
// text. Preserved byte-for-byte so old peers / in-flight / plain text decode
// exactly as before.
function decodeLegacyBody(raw) {
  let auto = false;
  let inReplyTo = null;
  let text = raw;
  if (typeof text === "string" && text.startsWith(AUTO_SENTINEL)) {
    auto = true;
    text = text.slice(AUTO_SENTINEL.length);
    if (text.startsWith(REPLY_OPEN)) {
      const end = text.indexOf(REPLY_CLOSE, REPLY_OPEN.length);
      if (end !== -1) {
        inReplyTo = text.slice(REPLY_OPEN.length, end);
        text = text.slice(end + REPLY_CLOSE.length);
      }
    }
  }
  return { auto, inReplyTo, text, messageId: null, fromSession: null, toSession: null, fromSessionUuid: null, role: null, envelope: false };
}

// Build a legacy auto-reply body (auto tag + optional re: header + plaintext).
// Retained for the legacy self-drain fallback path; new sends use encodeEnvelope.
export function encodeAutoReply(inReplyTo, text) {
  const head = AUTO_SENTINEL + (inReplyTo ? REPLY_OPEN + inReplyTo + REPLY_CLOSE : "");
  return head + text;
}

// Parse a decrypted body. Tries the structured SessionEnvelope path first (JSON
// carrying the right envelope_version), then falls back to legacy/plaintext.
export function decodeBody(raw) {
  if (typeof raw === "string" && raw.trimStart().startsWith("{")) {
    try {
      const obj = JSON.parse(raw);
      if (obj && obj.envelope_version === SESSION_ENVELOPE_VERSION) return decodeEnvelope(obj);
    } catch {
      // Not valid JSON — fall through to the legacy decoder.
    }
  }
  return decodeLegacyBody(raw);
}
