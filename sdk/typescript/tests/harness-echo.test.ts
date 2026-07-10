import { describe, expect, it } from "vitest";

import {
  envelopeRole,
  envelopeText,
} from "../src/cli/harness-wrapper.js";
import { buildEventEnvelopeV2 } from "../src/cli/harness-envelope.js";
import type { EnvelopeContext } from "../src/cli/harness-envelope.js";
import type { HarnessSemanticEvent } from "../src/cli/harness-events.js";
import {
  SESSION_ENVELOPE_VERSION_V1,
  type AnySessionEnvelope,
} from "../src/index.js";

const ctx: EnvelopeContext = {
  provider: "claude",
  command: "claude",
  argv: [],
  scopeType: "session",
  scopeKey: "abc",
  cwd: "/work/proj",
  wrapperSessionId: "wrap-1",
  harnessSessionId: "sess-1",
  bucketUnit: "hour",
  sourcePath: "/home/u/.claude/projects/p/sess-1.jsonl",
};

// The exact shape the tailer emits for an owner→agent prompt in v2: kind
// `user_prompt`, role `owner`, text under event.payload.text.
const userPrompt: HarnessSemanticEvent = {
  line: 3,
  timestamp: new Date("2026-07-07T10:00:00.000Z"),
  recordType: "user",
  event: {
    kind: "user_prompt",
    role: "owner",
    payload: { text: "ping from the owner" },
  },
};

describe("envelope role/text extraction (echo suppression)", () => {
  it("reads a v2 user_prompt as an owner turn with its payload text", () => {
    const envelope = buildEventEnvelopeV2(ctx, userPrompt, 1);

    // Regression guard: envelopeRole must surface `owner` (not fall through to
    // "user") and envelopeText must read event.payload.text — otherwise the
    // publisher's isInjectedEcho misses v2 echoes and the owner sees its own
    // injected prompt bounce back, re-feeding the auto-reply loop.
    expect(envelopeRole(envelope)).toBe("owner");
    expect(envelopeText(envelope)).toBe("ping from the owner");
  });

  it("reads a v1 envelope from its message fields", () => {
    const v1 = {
      envelope_version: SESSION_ENVELOPE_VERSION_V1,
      message: { role: "user", text: "hello v1" },
    } as unknown as AnySessionEnvelope;

    expect(envelopeRole(v1)).toBe("user");
    expect(envelopeText(v1)).toBe("hello v1");
  });
});
