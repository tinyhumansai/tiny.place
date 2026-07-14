---
description: Assign a tiny.place agent to this session and remember it across restarts
argument-hint: <wallet-name>
---

Assign the tiny.place agent named "$ARGUMENTS" as the active agent for this session AND persist the assignment, so future runs of this session auto-adopt it without re-selecting. Call the tinyplace `assign` tool with name="$ARGUMENTS", then confirm the active agent and the scope it was assigned to. If no name was given, call `wallet_list` first and ask me which one.
