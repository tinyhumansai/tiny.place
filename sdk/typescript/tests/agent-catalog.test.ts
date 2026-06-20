import { describe, expect, it } from "vitest";
import {
  AGENT_CATALOG,
  CATALOG_VERSION,
  describeOperation,
} from "../src/agent/catalog.js";
import { HARNESS_CLI_COMMANDS, runTinyPlaceCli } from "../src/cli.js";
import { TINYPLACE_ERROR_CODES } from "../src/errors.js";

const commandNames = new Set(HARNESS_CLI_COMMANDS.map((command) => command.name));

describe("AGENT_CATALOG", () => {
  it("is non-empty and every operation's cli token is a real command", () => {
    expect(AGENT_CATALOG.length).toBeGreaterThan(10);
    for (const operation of AGENT_CATALOG) {
      const token = operation.cli.split(/\s+/)[1];
      expect(commandNames.has(token!), `${operation.name} -> ${token}`).toBe(
        true,
      );
      expect(operation.summary.length).toBeGreaterThan(0);
      expect(operation.example.startsWith("tinyplace ")).toBe(true);
    }
  });

  it("uses only known error codes in `recovers`", () => {
    const known = new Set(TINYPLACE_ERROR_CODES);
    for (const operation of AGENT_CATALOG) {
      for (const code of operation.recovers ?? []) {
        expect(known.has(code), code).toBe(true);
      }
    }
  });

  it("describeOperation looks up by name", () => {
    expect(describeOperation("onboard")?.needsSigner).toBe(true);
    expect(describeOperation("discover")?.reads).toBe(true);
    expect(describeOperation("nope")).toBeUndefined();
  });
});

describe("tinyplace catalog / describe", () => {
  const env = { TINYPLACE_ENDPOINT: "https://example.test" };
  const fetch = async (): Promise<Response> => Response.json({ ok: true });

  it("`catalog` prints the versioned operations list", async () => {
    const result = await runTinyPlaceCli(["catalog"], { env, fetch });
    expect(result.code).toBe(0);
    const parsed = JSON.parse(result.stdout) as {
      version: string;
      operations: Array<{ name: string }>;
    };
    expect(parsed.version).toBe(CATALOG_VERSION);
    expect(parsed.operations.map((op) => op.name)).toContain("onboard");
  });

  it("`describe <op>` prints a single operation", async () => {
    const result = await runTinyPlaceCli(["describe", "message"], { env, fetch });
    expect(JSON.parse(result.stdout)).toMatchObject({
      name: "message",
      needsSigner: true,
    });
  });

  it("`describe errors` prints the recovery contract for every code", async () => {
    const result = await runTinyPlaceCli(["describe", "errors"], { env, fetch });
    const parsed = JSON.parse(result.stdout) as {
      errors: Array<{ code: string }>;
    };
    expect(parsed.errors.map((row) => row.code)).toEqual([
      ...TINYPLACE_ERROR_CODES,
    ]);
  });

  it("`describe <unknown>` fails with a helpful error", async () => {
    const result = await runTinyPlaceCli(["describe", "bogus"], { env, fetch });
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stderr).error).toMatch(/unknown operation/);
  });
});
