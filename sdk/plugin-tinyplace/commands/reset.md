---
description: Reset a stuck (undecryptable) Signal session with a peer and re-handshake
argument-hint: "<peer @handle/address>  (omit to republish your own keys)"
---

Recover a tiny.place channel where messages have stopped decrypting. Call the tinyplace `reset_session` tool with peer="$ARGUMENTS" (if a peer was given) — that clears the local Signal session with them and sends a fresh handshake so the next message re-runs X3DH. If no peer was given, call `reset_session` with no arguments to republish your own key bundle. Report what was reset.
