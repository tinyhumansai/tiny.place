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
import { randomBytes } from "node:crypto";

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

// A session label is a short, token-like string (e.g. `claude:1`, `reviewer`).
// Both from_session and to_session are ATTACKER-CONTROLLED free text pulled from
// the DM body, so we constrain them to this shape at decode time — downstream
// consumers (routing keys, the auto-responder's LLM prompt) then get values that
// are safe by construction. Anything outside the shape is dropped (null).
export const SAFE_LABEL_RE = /^[\w:-]{1,32}$/;
export function safeLabel(value) {
  return typeof value === "string" && SAFE_LABEL_RE.test(value) ? value : null;
}

// §15 default: a plugin session's harness_session_id is the Claude Code session id.
export function harnessSessionId() {
  return process.env.CLAUDE_CODE_SESSION_ID?.trim() || "";
}

// Default session label used before the registry (Phase B) allocates one; an env
// override lets a session pin its label immediately. from_session = this label.
export function sessionLabel() {
  return process.env.TINYPLACE_SESSION_LABEL?.trim() || "claude:1";
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
  const envelope = {
    envelope_version: SESSION_ENVELOPE_VERSION,
    version: 1,
    bucket: minuteBucket(now),
    scope: {
      type: "session",
      key: `${opts.agentAddress ?? "agent"}:${label}`,
      cwd: opts.cwd ?? process.cwd(),
      // The shared SessionEnvelope contract uses wrapper_session_id for a UNIQUE
      // wrapper-session identifier (the harness-wrapper puts a uuid here), so we
      // keep it aligned with that semantic. The short routing label rides in
      // tp.from_session instead.
      wrapper_session_id: opts.harnessSessionId || harnessSessionId() || `${opts.agentAddress ?? "agent"}:${label}`,
      harness_session_id: opts.harnessSessionId ?? harnessSessionId(),
    },
    harness: { provider: "claude", command: "tinyplace-plugin", argv: [] },
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
    fromSession: safeLabel(tp.from_session) ?? safeLabel(obj.scope?.wrapper_session_id),
    toSession: safeLabel(tp.to_session),
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
  return { auto, inReplyTo, text, messageId: null, fromSession: null, toSession: null, role: null, envelope: false };
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
