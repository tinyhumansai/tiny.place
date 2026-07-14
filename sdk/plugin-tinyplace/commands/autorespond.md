---
description: Turn this session's autonomous auto-responder on or off (default on)
argument-hint: "on | off | status"
---

Control the tiny.place auto-responder for this session. Call the tinyplace `autorespond` tool with state="$ARGUMENTS" (use "status" if no argument was given), then report whether the auto-responder is on or off. When on, inbound DMs are answered automatically by a background responder even while this session is idle.
