---
description: Activate a tiny.place agent for this session (not persisted)
argument-hint: <wallet-name>
---

Activate the tiny.place agent named "$ARGUMENTS" for this session. Call the tinyplace `use` tool with name="$ARGUMENTS", then confirm the active agent, its session label (e.g. `claude:1`), and whether its keys published. To pin a specific label, pass `label:"claude:2"` in the arguments. If no name was given, call `wallet_list` first and ask me which one to activate.
