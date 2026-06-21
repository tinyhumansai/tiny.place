import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { updateNotice } from "../src/cli/update-notice.js";

async function configDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "tinyplace-update-"));
}

function npmFetch(version: string | undefined): typeof globalThis.fetch {
  return (async () =>
    Response.json(
      version === undefined ? {} : { version },
    )) as typeof globalThis.fetch;
}

describe("updateNotice", () => {
  it("nudges with the upgrade command when npm reports a newer version", async () => {
    const dir = await configDir();
    const notice = await updateNotice({
      env: { TINYPLACE_CONFIG: join(dir, "config.json") },
      fetch: npmFetch("999.0.0"),
    });
    expect(notice).toContain("Update available");
    expect(notice).toContain("999.0.0");
    expect(notice).toContain("tinyplace update");
    expect(notice).toContain("npm install -g @tinyhumansai/tinyplace@latest");
  });

  it("stays silent when already on the latest version", async () => {
    const dir = await configDir();
    const current = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8"),
    ).version as string;
    const notice = await updateNotice({
      env: { TINYPLACE_CONFIG: join(dir, "config.json") },
      fetch: npmFetch(current),
    });
    expect(notice).toBe("");
  });

  it("does not nudge when the installed build is ahead of npm", async () => {
    const dir = await configDir();
    const notice = await updateNotice({
      env: { TINYPLACE_CONFIG: join(dir, "config.json") },
      fetch: npmFetch("0.0.1"),
    });
    expect(notice).toBe("");
  });

  it("honors the opt-out env vars without touching the network", async () => {
    const dir = await configDir();
    let fetched = false;
    const fetch = (async () => {
      fetched = true;
      return Response.json({ version: "999.0.0" });
    }) as typeof globalThis.fetch;
    for (const env of [
      { TINYPLACE_NO_UPDATE_NOTICE: "1" },
      { NO_UPDATE_NOTIFIER: "true" },
    ]) {
      const notice = await updateNotice({
        env: { TINYPLACE_CONFIG: join(dir, "config.json"), ...env },
        fetch,
      });
      expect(notice).toBe("");
    }
    expect(fetched).toBe(false);
  });

  it("caches the npm probe and re-uses it within the day", async () => {
    const dir = await configDir();
    const env = { TINYPLACE_CONFIG: join(dir, "config.json") };
    let calls = 0;
    const fetch = (async () => {
      calls += 1;
      return Response.json({ version: "999.0.0" });
    }) as typeof globalThis.fetch;

    const first = await updateNotice({ env, fetch, now: 1_000 });
    const second = await updateNotice({ env, fetch, now: 1_000 + 60_000 });
    expect(first).toContain("999.0.0");
    expect(second).toContain("999.0.0");
    expect(calls).toBe(1);

    // A day later the cache is stale and we probe again.
    await updateNotice({ env, fetch, now: 1_000 + 25 * 60 * 60 * 1000 });
    expect(calls).toBe(2);
  });

  it("falls back to a stale cache when the network is unavailable", async () => {
    const dir = await configDir();
    const cachePath = join(dir, "update-check.json");
    await writeFile(
      cachePath,
      JSON.stringify({ latest: "999.0.0", checkedAt: 0 }),
    );
    const failingFetch = (async () => {
      throw new Error("offline");
    }) as typeof globalThis.fetch;
    const notice = await updateNotice({
      env: { TINYPLACE_CONFIG: join(dir, "config.json") },
      fetch: failingFetch,
      now: 10 * 24 * 60 * 60 * 1000,
    });
    expect(notice).toContain("999.0.0");
  });

  it("stays silent (never throws) when npm omits a version", async () => {
    const dir = await configDir();
    const notice = await updateNotice({
      env: { TINYPLACE_CONFIG: join(dir, "config.json") },
      fetch: npmFetch(undefined),
    });
    expect(notice).toBe("");
  });
});
