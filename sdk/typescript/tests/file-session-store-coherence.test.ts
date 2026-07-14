import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FileSessionStore } from "../src/node/file-session-store.js";
import { generateX25519KeyPair } from "../src/signal/index.js";
import type { SessionState } from "../src/signal/index.js";

function sessionState(marker: number): SessionState {
  return {
    dhSendKeyPair: generateX25519KeyPair(),
    dhRecvPublicKey: null,
    rootKey: new Uint8Array(32).fill(1),
    sendChainKey: new Uint8Array(32).fill(2),
    recvChainKey: null,
    sendMessageNumber: marker,
    recvMessageNumber: 0,
    previousChainLength: 0,
    skippedKeys: new Map(),
  };
}

describe("FileSessionStore cross-process coherence", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "tp-store-coherence-"));
  });

  afterEach(() => {
    rmSync(dir, { force: true, recursive: true });
  });

  it("re-reads a session another store instance advanced on disk", async () => {
    const path = join(dir, "signal.json");
    const identity = generateX25519KeyPair();
    const a = new FileSessionStore(path, identity);
    const b = new FileSessionStore(path, identity);

    await a.storeSession("peer", sessionState(1));
    // b loads (and caches) the state written by a.
    expect((await b.getSession("peer"))?.sendMessageNumber).toBe(1);

    // a advances the ratchet; ensure a distinct mtime for coarse filesystems.
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 5));
    await a.storeSession("peer", sessionState(7));

    // Without stat-based invalidation b would return its stale cache (1) and a
    // later write from b would roll a's chain back.
    expect((await b.getSession("peer"))?.sendMessageNumber).toBe(7);
  });

  it("a stale instance's write does not resurrect its old cache", async () => {
    const path = join(dir, "signal.json");
    const identity = generateX25519KeyPair();
    const a = new FileSessionStore(path, identity);
    const b = new FileSessionStore(path, identity);

    await a.storeSession("peer", sessionState(1));
    expect((await b.getSession("peer"))?.sendMessageNumber).toBe(1);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 5));
    await a.storeSession("peer", sessionState(7));

    // b writes a DIFFERENT session; it must first reload, so peer stays at 7.
    await b.storeSession("other", sessionState(2));
    expect((await a.getSession("peer"))?.sendMessageNumber).toBe(7);
    expect((await a.getSession("other"))?.sendMessageNumber).toBe(2);
  });
});
