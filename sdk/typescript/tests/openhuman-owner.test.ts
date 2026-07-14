import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runTinyPlaceCli } from "../src/cli.js";
import { makeContext, saveOpenHumanOwner } from "../src/cli/context.js";

/**
 * The TUI "Connect with OpenHuman" step persists the owner so the next launch
 * auto-connects the bridge without re-asking. These lock the round-trip through
 * the CLI config file (independent of the interactive Blessed layer).
 */
describe("OpenHuman owner persistence", () => {
  async function tempConfig(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "tinyplace-owner-"));
    return join(dir, "config.json");
  }

  it("saves the owner and makeContext reads it back", async () => {
    const configPath = await tempConfig();
    const env = { TINYPLACE_CONFIG: configPath };

    await saveOpenHumanOwner(env, "@carol");

    // Persisted to disk under the documented key.
    const onDisk = JSON.parse(await readFile(configPath, "utf8")) as {
      openHumanOwner?: string;
    };
    expect(onDisk.openHumanOwner).toBe("@carol");

    // And surfaced on the context the TUI auto-connects from.
    const ctx = await makeContext({ env });
    expect(ctx.openHumanOwner).toBe("@carol");
  });

  it("trims whitespace and preserves the identity key on the same file", async () => {
    const configPath = await tempConfig();
    await writeFile(
      configPath,
      JSON.stringify({ secretKey: "ab".repeat(32) }),
      "utf8",
    );
    const env = { TINYPLACE_CONFIG: configPath };

    await saveOpenHumanOwner(env, "  6wNaBJkatir4B86cw5ykHZWQ3xoNaKygX5vAU9MQbHSh  ");

    const onDisk = JSON.parse(await readFile(configPath, "utf8")) as {
      openHumanOwner?: string;
      secretKey?: string;
    };
    expect(onDisk.openHumanOwner).toBe(
      "6wNaBJkatir4B86cw5ykHZWQ3xoNaKygX5vAU9MQbHSh",
    );
    // The wallet key the config already held is untouched by the owner write.
    expect(onDisk.secretKey).toBe("ab".repeat(32));
  });

  it("clears the stored owner when passed an empty value", async () => {
    const configPath = await tempConfig();
    const env = { TINYPLACE_CONFIG: configPath };

    await saveOpenHumanOwner(env, "@dave");
    await saveOpenHumanOwner(env, "   ");

    const ctx = await makeContext({ env });
    expect(ctx.openHumanOwner).toBeUndefined();
  });

  it("renders a persisted owner as auto-connect in the non-TTY home snapshot", async () => {
    const configPath = await tempConfig();
    const env = {
      TINYPLACE_CONFIG: configPath,
      TINYPLACE_ENDPOINT: "https://example.test",
    };
    await saveOpenHumanOwner(env, "@carol");

    const home = await runTinyPlaceCli([], { env });
    expect(home.code).toBe(0);
    expect(home.stdout).toContain("@carol (auto-connect on launch)");
  });

  it("rejects on a corrupt config instead of clobbering it (caller must catch)", async () => {
    const configPath = await tempConfig();
    // Unparseable JSON: loadCliConfig rethrows (non-ENOENT), so the save must
    // reject rather than silently overwrite — otherwise it would drop the
    // secretKey. The TUI call site swallows this with `.catch()`.
    await writeFile(configPath, "{ not valid json", "utf8");
    await expect(
      saveOpenHumanOwner({ TINYPLACE_CONFIG: configPath }, "@eve"),
    ).rejects.toThrow();
    // The corrupt file is left untouched (not overwritten with a partial config).
    expect(await readFile(configPath, "utf8")).toBe("{ not valid json");
  });
});
