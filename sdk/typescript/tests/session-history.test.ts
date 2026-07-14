import { mkdtemp, mkdir, writeFile, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { listRecentSessions } from "../src/cli/session-history.js";

/** Build a claude session JSONL: leading meta lines, then user/tool turns. */
function claudeSession(
  sessionId: string,
  cwd: string,
  userTexts: Array<string>,
): string {
  const lines: Array<Record<string, unknown>> = [
    { type: "last-prompt", sessionId },
    { type: "mode", mode: "normal", sessionId },
    // A tool-result user turn (array content, no text block) must be skipped.
    {
      type: "user",
      sessionId,
      cwd,
      message: {
        role: "user",
        content: [{ type: "tool_result", content: "ok" }],
      },
    },
    ...userTexts.map((text) => ({
      type: "user",
      sessionId,
      cwd,
      message: { role: "user", content: text },
    })),
  ];
  return lines.map((line) => JSON.stringify(line)).join("\n");
}

/** Build a codex rollout JSONL: session_meta, developer noise, then user turns. */
function codexSession(
  sessionId: string,
  cwd: string,
  userTexts: Array<string>,
): string {
  const lines: Array<Record<string, unknown>> = [
    { type: "session_meta", payload: { session_id: sessionId, id: sessionId, cwd } },
    {
      type: "response_item",
      payload: {
        type: "message",
        role: "developer",
        content: [{ type: "input_text", text: "<permissions instructions>" }],
      },
    },
    ...userTexts.map((text) => ({
      type: "response_item",
      payload: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text }],
      },
    })),
  ];
  return lines.map((line) => JSON.stringify(line)).join("\n");
}

async function stage(): Promise<{
  env: Record<string, string | undefined>;
  claudeDir: string;
  codexDir: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "tp-history-"));
  const claudeDir = join(root, "claude");
  const codexDir = join(root, "codex");
  await mkdir(claudeDir, { recursive: true });
  await mkdir(codexDir, { recursive: true });
  return {
    claudeDir,
    codexDir,
    env: {
      TINYPLACE_CLAUDE_SESSIONS_DIR: claudeDir,
      TINYPLACE_CODEX_SESSIONS_DIR: codexDir,
    },
  };
}

/** Write a file then bump its mtime so ordering is deterministic. */
async function writeSession(
  path: string,
  content: string,
  mtime: Date,
): Promise<void> {
  await writeFile(path, content);
  await utimes(path, mtime, mtime);
}

describe("listRecentSessions", () => {
  it("extracts the first real prompt as the label, skipping wrappers", async () => {
    const { env, claudeDir, codexDir } = await stage();
    await writeSession(
      join(claudeDir, "a.jsonl"),
      claudeSession("claude-1", "/work/alpha", ["fix the login bug"]),
      new Date("2026-07-01T10:00:00Z"),
    );
    await writeSession(
      join(codexDir, "rollout-1.jsonl"),
      // First user turn is an <environment_context> wrapper → skipped.
      codexSession("codex-1", "/work/beta", [
        "<environment_context><cwd>/work/beta</cwd></environment_context>",
        "add a payment endpoint",
      ]),
      new Date("2026-07-01T09:00:00Z"),
    );

    const sessions = listRecentSessions(env, "/somewhere/else");

    expect(sessions).toHaveLength(2);
    const claude = sessions.find((s) => s.agent === "claude");
    const codex = sessions.find((s) => s.agent === "codex");
    expect(claude).toMatchObject({
      id: "claude-1",
      cwd: "/work/alpha",
      label: "fix the login bug",
    });
    expect(codex).toMatchObject({
      id: "codex-1",
      cwd: "/work/beta",
      label: "add a payment endpoint",
    });
  });

  it("orders current-folder sessions first, then by recency", async () => {
    const { env, claudeDir } = await stage();
    // Older, but in the current folder → must sort ahead of the newer one.
    await writeSession(
      join(claudeDir, "here.jsonl"),
      claudeSession("here", "/work/here", ["local work"]),
      new Date("2026-07-01T08:00:00Z"),
    );
    await writeSession(
      join(claudeDir, "there.jsonl"),
      claudeSession("there", "/work/there", ["remote work"]),
      new Date("2026-07-02T08:00:00Z"),
    );

    const sessions = listRecentSessions(env, "/work/here");

    expect(sessions.map((s) => s.id)).toEqual(["here", "there"]);
  });

  it("honors the limit", async () => {
    const { env, claudeDir } = await stage();
    for (let index = 0; index < 5; index += 1) {
      await writeSession(
        join(claudeDir, `s${index}.jsonl`),
        claudeSession(`s${index}`, "/work/x", [`prompt ${index}`]),
        new Date(2026, 6, 1, 0, index),
      );
    }

    const sessions = listRecentSessions(env, "/work/x", { limit: 2 });

    expect(sessions).toHaveLength(2);
  });

  it("truncates a long prompt to a single line", async () => {
    const { env, claudeDir } = await stage();
    const long = `${"a".repeat(200)}\nsecond line`;
    await writeSession(
      join(claudeDir, "long.jsonl"),
      claudeSession("long", "/work/x", [long]),
      new Date("2026-07-01T10:00:00Z"),
    );

    const [session] = listRecentSessions(env, "/work/x");

    expect(session.label.length).toBeLessThanOrEqual(72);
    expect(session.label).not.toContain("\n");
    expect(session.label.endsWith("…")).toBe(true);
  });

  it("strips terminal control bytes from the label", async () => {
    const { env, claudeDir } = await stage();
    // ESC[31m … BEL — an escape sequence smuggled through a prior prompt.
    const nasty = "hi \u001b[31mRED\u001b[0m\u0007 there";
    await writeSession(
      join(claudeDir, "ctl.jsonl"),
      claudeSession("ctl", "/work/x", [nasty]),
      new Date("2026-07-01T10:00:00Z"),
    );

    const [session] = listRecentSessions(env, "/work/x");

    // eslint-disable-next-line no-control-regex -- asserting they were stripped
    expect(session.label).not.toMatch(/[\u0000-\u001F\u007F-\u009F]/);
    expect(session.label).toContain("RED");
  });

  it("returns an empty list when no session dirs exist", () => {
    const sessions = listRecentSessions(
      {
        TINYPLACE_CLAUDE_SESSIONS_DIR: "/nope/claude",
        TINYPLACE_CODEX_SESSIONS_DIR: "/nope/codex",
      },
      "/work/x",
    );
    expect(sessions).toEqual([]);
  });
});
