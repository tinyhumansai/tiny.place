// Offline, deterministic test of the SessionEnvelope-superset message format:
// encode/decode round-trip (incl. the tp block), legacy sentinel fallback, and
// plain text. No network, no MCP server — pure functions from mcp/format.mjs.
import {
  SESSION_ENVELOPE_VERSION,
  encodeEnvelope,
  encodeAutoReply,
  decodeBody,
} from "./mcp/format.mjs";

const checks = [];
const expect = (label, cond) => {
  checks.push({ label, ok: !!cond });
  console.log((cond ? "PASS " : "FAIL ") + label);
};

// 1. Full envelope round-trip with a tp block (to_session + in_reply_to + auto).
const body = encodeEnvelope({
  text: "hello world",
  role: "agent",
  toSession: "claude:2",
  inReplyTo: "msg-abc123",
  auto: true,
  fromSession: "claude:1",
  harnessSessionId: "hsid-xyz",
  agentAddress: "AgentAddr",
  cwd: "/work",
});
const parsedRaw = JSON.parse(body);
expect("envelope_version is the harness session schema", parsedRaw.envelope_version === SESSION_ENVELOPE_VERSION);
expect("valid SessionEnvelope shape: version/scope/harness/message/source", parsedRaw.version === 1 && !!parsedRaw.scope && !!parsedRaw.harness && !!parsedRaw.message && !!parsedRaw.source && !!parsedRaw.bucket);
expect("scope.wrapper_session_id is from_session label", parsedRaw.scope.wrapper_session_id === "claude:1");
expect("scope.harness_session_id threaded through", parsedRaw.scope.harness_session_id === "hsid-xyz");
expect("message.text is the plaintext", parsedRaw.message.text === "hello world");
expect("message.role preserved", parsedRaw.message.role === "agent");
expect("tp block namespaced (v/to_session/in_reply_to/auto)", parsedRaw.tp.v === 1 && parsedRaw.tp.to_session === "claude:2" && parsedRaw.tp.in_reply_to === "msg-abc123" && parsedRaw.tp.auto === true);

const d = decodeBody(body);
expect("decode: envelope flag set", d.envelope === true);
expect("decode: text", d.text === "hello world");
expect("decode: role", d.role === "agent");
expect("decode: fromSession", d.fromSession === "claude:1");
expect("decode: toSession", d.toSession === "claude:2");
expect("decode: inReplyTo", d.inReplyTo === "msg-abc123");
expect("decode: auto", d.auto === true);

// 2. Minimal envelope (no tp targets) round-trips with sane defaults.
const plainEnv = encodeEnvelope({ text: "just a note", fromSession: "claude:1" });
const dp = decodeBody(plainEnv);
expect("minimal envelope: role defaults to agent", dp.role === "agent");
expect("minimal envelope: no toSession/inReplyTo, auto false", dp.toSession === null && dp.inReplyTo === null && dp.auto === false);
expect("minimal envelope: text preserved", dp.text === "just a note");

// 3. role='user' honored (harness-wrapper interop path).
const userEnv = encodeEnvelope({ text: "as user", role: "user", fromSession: "claude:3" });
const du = decodeBody(userEnv);
expect("role=user preserved and surfaced", du.role === "user" && du.fromSession === "claude:3");

// 4. Harness-wrapper DM: a valid SessionEnvelope with NO tp block decodes fine.
const wrapperEnv = JSON.parse(encodeEnvelope({ text: "from wrapper", role: "user", fromSession: "codex:1" }));
delete wrapperEnv.tp;
const dw = decodeBody(JSON.stringify(wrapperEnv));
expect("wrapper DM (no tp): envelope path, role+fromSession surfaced", dw.envelope === true && dw.role === "user" && dw.fromSession === "codex:1" && dw.auto === false && dw.toSession === null);

// 5. Legacy fallback: AUTO_SENTINEL + re: header + plaintext still decodes.
const legacy = encodeAutoReply("relay-id-42", "legacy reply text");
const dl = decodeBody(legacy);
expect("legacy: auto flag", dl.auto === true);
expect("legacy: inReplyTo extracted", dl.inReplyTo === "relay-id-42");
expect("legacy: text stripped of control header", dl.text === "legacy reply text");
expect("legacy: no session fields (envelope false)", dl.envelope === false && dl.fromSession === null && dl.role === null);

// 6. Legacy auto-reply without in_reply_to.
const legacyNoId = encodeAutoReply(null, "no correlation");
const dln = decodeBody(legacyNoId);
expect("legacy no-id: auto true, inReplyTo null, text clean", dln.auto === true && dln.inReplyTo === null && dln.text === "no correlation");

// 7. Plain text with no markers stays plain text.
const dpt = decodeBody("just a normal message");
expect("plain text: unchanged, no auto/envelope", dpt.text === "just a normal message" && dpt.auto === false && dpt.envelope === false);

// 8. Non-envelope JSON that happens to start with { is treated as plain text.
const dj = decodeBody('{"foo":"bar"}');
expect("non-envelope JSON → plain text (not envelope)", dj.envelope === false && dj.text === '{"foo":"bar"}');

const failed = checks.filter((c) => !c.ok);
console.log("\n" + (failed.length === 0 ? `ALL ${checks.length} CHECKS PASSED ✅` : `${failed.length} FAILED ❌`));
process.exit(failed.length === 0 ? 0 : 1);
