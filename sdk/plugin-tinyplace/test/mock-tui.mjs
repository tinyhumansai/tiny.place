#!/usr/bin/env node
// Minimal stand-in "TUI" for the mock harness launch path (bin/tinyplace.mjs ->
// mockAdapter.launch.prepare). The real orchestration e2e drives the per-agent
// daemon directly and never launches this; it exists so the launcher recipe is
// valid and `tinyplace --harness mock --wallet <name>` opens a session that stays
// alive (the daemon it triggers does the actual relay work). It just idles until
// interrupted, so a human can watch the daemon logs while driving the flow from
// another process (see orchestration-live-e2e.mjs / HUMAN_FLOW comments).
const wallet = process.env.TINYPLACE_ACTIVE_WALLET ?? "(none)";
process.stdout.write(
  `tinyplace mock TUI — active wallet: ${wallet}\n` +
    "This is a headless stand-in for a coding-agent terminal. The tiny.place\n" +
    "daemon handles inbound/outbound; press Ctrl-C to exit.\n",
);
const timer = setInterval(() => {}, 1 << 30);
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    clearInterval(timer);
    process.exit(0);
  });
}
