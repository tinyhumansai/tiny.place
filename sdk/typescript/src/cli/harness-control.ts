// Owner → machine control frames for the harness session bus.
//
// A machine runs ONE tiny.place wallet shared by every wrapped harness session
// on it (see machine-bus.ts). Plaintext DMs keep their historical meaning —
// they are injected into the machine's primary session — while a control frame
// lets the owner address a SPECIFIC session by id. The session id is the one
// the machine advertises on its envelope scope: the harness's own session id
// (`scope.harness_session_id`, e.g. the codex rollout id) or the wrapper
// session id (`scope.wrapper_session_id`) — a frame may name either.

export const HARNESS_CONTROL_VERSION = "tinyplace.harness.control.v1";

export interface HarnessControlFrame {
  control_version: typeof HARNESS_CONTROL_VERSION;
  /** `input` types the text into the addressed session's agent as a prompt. */
  kind: "input";
  /** Target session (wrapper or harness session id). Absent → primary session. */
  session_id?: string;
  text: string;
}

export interface EncodeHarnessControlOptions {
  sessionId?: string;
}

/** Serialize an `input` control frame for the encrypted DM body. */
export function encodeHarnessControlFrame(
  text: string,
  options: EncodeHarnessControlOptions = {},
): string {
  const frame: HarnessControlFrame = {
    control_version: HARNESS_CONTROL_VERSION,
    kind: "input",
    ...(options.sessionId ? { session_id: options.sessionId } : {}),
    text,
  };
  return JSON.stringify(frame);
}

/**
 * Decode a DM body into a {@link HarnessControlFrame}, or undefined when the
 * body is not one of ours (plaintext, a session envelope, another protocol, or
 * a malformed frame). Never throws — inbound Signal DMs are untrusted.
 */
export function parseHarnessControlFrame(
  body: string,
): HarnessControlFrame | undefined {
  if (!body.trimStart().startsWith("{")) {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return undefined;
  }
  if (parsed === null || typeof parsed !== "object") {
    return undefined;
  }
  const record = parsed as Record<string, unknown>;
  if (record.control_version !== HARNESS_CONTROL_VERSION) {
    return undefined;
  }
  if (record.kind !== "input" || typeof record.text !== "string") {
    return undefined;
  }
  const sessionId =
    typeof record.session_id === "string" && record.session_id.length > 0
      ? record.session_id
      : undefined;
  return {
    control_version: HARNESS_CONTROL_VERSION,
    kind: "input",
    ...(sessionId ? { session_id: sessionId } : {}),
    text: record.text,
  };
}
