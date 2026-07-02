export type HarnessProvider = "codex" | "claude";

export type HarnessMessageRole = "user" | "agent";

export type HarnessBucketUnit = "minute" | "hour" | "day";

export type HarnessEnvelopeScope = "folder" | "session";

export const SESSION_ENVELOPE_VERSION_V1 = "tinyplace.harness.session.v1";

export interface SessionEnvelopeV1 {
  envelope_version: typeof SESSION_ENVELOPE_VERSION_V1;
  version: 1;
  bucket: {
    unit: HarnessBucketUnit;
    start: string;
    end: string;
  };
  scope: {
    type: HarnessEnvelopeScope;
    key: string;
    cwd: string;
    wrapper_session_id: string;
    harness_session_id: string;
  };
  harness: {
    provider: HarnessProvider;
    command: string;
    argv: Array<string>;
  };
  message: {
    id: string;
    line: number;
    role: HarnessMessageRole;
    text: string;
    timestamp: string;
    phase?: string;
  };
  source: {
    path: string;
    record_type: string;
    source_role?: string;
  };
}

export type SessionEnvelope = SessionEnvelopeV1;
