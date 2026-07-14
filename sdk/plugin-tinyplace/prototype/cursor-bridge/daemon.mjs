// Instant reverse auto-push daemon.
//
// Cursor exposes no way to push text into an idle agent, so we do it at the OS
// level: poll the bridge inbox and, when OpenHuman sends a DM, paste it into
// Cursor's chat composer via the clipboard + System Events (Cmd+V, Enter). The
// message is prefixed with the INJECT sentinel so beforeSubmitPrompt skips echoing
// it back to OpenHuman.
//
// Requires macOS Accessibility permission for the process running osascript
// (System Preferences → Privacy & Security → Accessibility → enable your terminal
// / node). First push fails loudly in the log if it's not granted.
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import {
  build,
  OPENHUMAN,
  log,
  recordPush,
  withLock,
  AWAITING,
} from "./common.mjs";

const POLL_MS = Number(process.env.BRIDGE_POLL_MS) || 3000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The approval hook holds this flag while it waits for an OpenHuman allow/deny; it
// must be the SOLE inbox reader then, so the daemon pauses. Ignore a stale flag
// (crashed hook) older than 6 min so a crash can't wedge reverse delivery forever.
function approvalPending() {
  try {
    return (
      existsSync(AWAITING) && Date.now() - statSync(AWAITING).mtimeMs < 360_000
    );
  } catch {
    return false;
  }
}

function extractText(raw) {
  try {
    const o = JSON.parse(raw);
    if (
      o &&
      o.envelope_version &&
      o.message &&
      typeof o.message.text === "string"
    ) {
      return o.message.text;
    }
  } catch {
    /* plain DM */
  }
  return raw;
}

// Put text on the clipboard, focus Cursor, paste, and submit. Clipboard paste
// (vs keystroke) sidesteps all escaping and handles any characters. Single-line
// so the paste doesn't submit early — our explicit Return submits.
function pushToCursor(text) {
  const oneLine = String(text)
    .replace(/\s*\n\s*/g, " ")
    .trim();
  const copy = spawnSync("pbcopy", [], { input: oneLine });
  if (copy.status !== 0) {
    log(`pbcopy failed: ${copy.stderr}`);
    return false;
  }
  // Remember whatever app the user is in (e.g. OpenHuman), briefly bring Cursor to
  // front to paste+submit, then RESTORE the previous app so OpenHuman isn't left in
  // the background. Cursor keeps running its turn once submitted.
  const lines = [
    'tell application "System Events" to set prevApp to name of first application process whose frontmost is true',
    'tell application "Cursor" to activate',
    "delay 0.25",
    'tell application "System Events" to keystroke "v" using command down',
    "delay 0.12",
    'tell application "System Events" to key code 36',
    "delay 0.12",
    'tell application "System Events" to set frontmost of process prevApp to true',
  ];
  const args = lines.flatMap((l) => ["-e", l]);
  const r = spawnSync("osascript", args, { encoding: "utf8" });
  if (r.status !== 0) {
    log(
      `osascript FAILED (Accessibility permission?): ${String(r.stderr).trim()}`,
    );
    return false;
  }
  return true;
}

const { signer, client, agent } = await build();
log(
  `daemon START polling=${POLL_MS}ms as=${signer.agentId.slice(0, 10)}… from=${OPENHUMAN.slice(0, 10)}…`,
);

for (;;) {
  try {
    // While an approval is pending, the hook owns the inbox (it's watching for the
    // allow/deny DM) — don't drain it out from under them.
    if (approvalPending()) {
      await sleep(POLL_MS);
      continue;
    }
    // Serialize session-store access with the hooks (which SEND on the same store)
    // so the Double Ratchet state isn't corrupted by concurrent read/write (→ 400).
    const msgs = await withLock(() =>
      agent.readMessages(client, signer, { limit: 20 }),
    );
    const texts = msgs
      .filter((m) => m.from === OPENHUMAN)
      .map((m) => extractText(m.text))
      .filter((t) => String(t).trim());
    for (const t of texts) {
      const oneLine = String(t)
        .replace(/\s*\n\s*/g, " ")
        .trim();
      log(`PUSH -> Cursor (${oneLine.length} chars): ${oneLine.slice(0, 60)}`);
      // Record BEFORE pasting so beforeSubmitPrompt (which fires on submit) can
      // find the marker and skip echoing this message back to OpenHuman.
      recordPush(oneLine);
      pushToCursor(oneLine);
      await sleep(1500); // let Cursor settle + start its turn before the next push
    }
  } catch (e) {
    log(`daemon poll error: ${e.message}`);
  }
  await sleep(POLL_MS);
}
