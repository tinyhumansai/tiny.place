// File-based debug logging for the OpenHuman bridge.
//
// The TUI runs Blessed on stdout/stderr, so the bridge normally routes its
// diagnostics into a *discarding* sink (writing to the real streams would
// corrupt the screen). That makes bridge failures invisible. This module gives
// us an opt-in escape hatch: when `TINYPLACE_BRIDGE_LOG` points at a file path,
// every lifecycle event and every discarded diagnostic is appended there as
// JSONL, so a `tail -f` reveals exactly what the outbound tailer / publisher /
// inbound receiver are doing. When the env var is unset, everything here is a
// cheap no-op — safe to leave the call sites in permanently.
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Writable } from "node:stream";

const LOG_PATH = process.env.TINYPLACE_BRIDGE_LOG?.trim() || undefined;
let ensuredDir = false;

/** True when `TINYPLACE_BRIDGE_LOG` is set to a non-empty path. */
export function bridgeDebugEnabled(): boolean {
  return LOG_PATH !== undefined;
}

function redact(value: unknown): unknown {
  if (typeof value === "string") {
    // Keep envelope/message text readable but bounded so the log stays greppable.
    return value.length > 400
      ? `${value.slice(0, 400)}…(${value.length})`
      : value;
  }
  if (Array.isArray(value)) {
    return value.map(redact);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(
      value as Record<string, unknown>,
    )) {
      out[key] = redact(inner);
    }
    return out;
  }
  return value;
}

/** Append one structured event to the bridge log. No-op unless enabled. */
export function bridgeLog(tag: string, data?: Record<string, unknown>): void {
  if (LOG_PATH === undefined) {
    return;
  }
  try {
    if (!ensuredDir) {
      mkdirSync(dirname(LOG_PATH), { recursive: true });
      ensuredDir = true;
    }
    const record = {
      t: new Date().toISOString(),
      tag,
      ...(data ? (redact(data) as Record<string, unknown>) : {}),
    };
    appendFileSync(LOG_PATH, `${JSON.stringify(record)}\n`, {
      encoding: "utf8",
    });
  } catch {
    // Never let logging break the bridge.
  }
}

/**
 * A Writable that captures the bridge's free-text diagnostics (the `stderr`
 * argument the publisher/tailer/receiver write human-readable errors to) into
 * the debug log under a `diag` tag, instead of discarding them. When logging is
 * disabled it behaves exactly like the old discarding sink.
 */
export function createBridgeDiagSink(): Writable {
  return new Writable({
    write: (chunk: Buffer | string, _enc, cb) => {
      const text = Buffer.isBuffer(chunk)
        ? chunk.toString("utf8")
        : String(chunk);
      const trimmed = text.replace(/\n+$/, "");
      if (trimmed.length > 0) {
        bridgeLog("diag", { text: trimmed });
      }
      cb();
    },
  });
}
