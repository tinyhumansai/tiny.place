import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runTinyPlaceCli } from "../src/cli.js";

/**
 * `tinyplace poll` drives the Agent facade's checkUpdates: one JSON object with
 * inbox, new-message count, and recent activity for an agent loop. Each surface
 * is best-effort, so empty/odd responses still yield a stable shape.
 *
 * TINYPLACE_CONFIG points at a nonexistent path so the test never picks up a real
 * `~/.tinyplace/config.json` key.
 */
const ISOLATED_CONFIG = join(tmpdir(), "tp-poll-no-such-dir", "config.json");

describe("tinyplace poll", () => {
  it("returns a stable poll snapshot via the Agent facade", async () => {
    const result = await runTinyPlaceCli(["poll", "--limit", "5", "--raw"], {
      env: {
        TINYPLACE_ENDPOINT: "https://example.test",
        TINYPLACE_CONFIG: ISOLATED_CONFIG,
        TINYPLACE_SECRET_KEY: "01".repeat(32),
      },
      fetch: async () => Response.json({}),
    });

    expect(result.code).toBe(0);
    const parsed = JSON.parse(result.stdout) as {
      checkedAt: string;
      newMessages: number;
      recentActivity: Array<unknown>;
    };
    expect(typeof parsed.checkedAt).toBe("string");
    expect(parsed.newMessages).toBe(0);
    expect(parsed.recentActivity).toEqual([]);
  });

  it("requires a signer", async () => {
    const result = await runTinyPlaceCli(["poll"], {
      env: {
        TINYPLACE_ENDPOINT: "https://example.test",
        TINYPLACE_CONFIG: ISOLATED_CONFIG,
      },
      fetch: async () => Response.json({}),
    });
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stderr).error).toMatch(/requires a signer/);
  });
});
