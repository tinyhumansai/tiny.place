import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { LocalSigner } from "../src/index.js";
import { FileSessionStore } from "../src/node/index.js";

const dirs: Array<string> = [];
async function tempFile(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tp-signal-"));
  dirs.push(dir);
  return join(dir, "signal.json");
}

afterAll(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("FileSessionStore", () => {
  it("persists pre-keys and sessions across instances", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(7));
    const identity = await signer.getX25519KeyPair();
    const path = await tempFile();

    const peer = await LocalSigner.fromSeed(new Uint8Array(32).fill(9));
    const peerX25519 = await peer.getX25519KeyPair();

    // First instance writes a signed pre-key, a one-time pre-key, and a session.
    const writer = new FileSessionStore(path, identity);
    await writer.storeSignedPreKey({
      keyId: "spk_1",
      keyPair: identity,
      signature: new Uint8Array(64).fill(1),
    });
    await writer.storePreKey({
      keyId: "otk_1",
      keyPair: peerX25519,
      signature: new Uint8Array(64).fill(2),
    });
    await writer.storeSession("peer-address", {
      dhSendKeyPair: identity,
      dhRecvPublicKey: peerX25519.publicKey,
      rootKey: new Uint8Array(32).fill(3),
      sendChainKey: new Uint8Array(32).fill(4),
      recvChainKey: null,
      sendMessageNumber: 2,
      recvMessageNumber: 0,
      previousChainLength: 1,
      skippedKeys: new Map([["k1", new Uint8Array(32).fill(5)]]),
    });

    // A fresh instance on the same file rehydrates everything.
    const reader = new FileSessionStore(path, identity);
    const active = await reader.getActiveSignedPreKey();
    expect(active.keyId).toBe("spk_1");

    const session = await reader.getSession("peer-address");
    expect(session).not.toBeNull();
    expect(session!.sendMessageNumber).toBe(2);
    expect(session!.previousChainLength).toBe(1);
    expect(session!.recvChainKey).toBeNull();
    expect(Array.from(session!.rootKey)).toEqual(Array.from(new Uint8Array(32).fill(3)));
    expect(Array.from(session!.dhRecvPublicKey!)).toEqual(
      Array.from(peerX25519.publicKey),
    );
    expect(Array.from(session!.skippedKeys.get("k1")!)).toEqual(
      Array.from(new Uint8Array(32).fill(5)),
    );

    // Pre-key removal persists too.
    await reader.removePreKey("otk_1");
    const reader2 = new FileSessionStore(path, identity);
    expect(await reader2.getPreKey("otk_1")).toBeNull();
  });

  it("returns an empty store when the file does not exist", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(8));
    const identity = await signer.getX25519KeyPair();
    const store = new FileSessionStore(await tempFile(), identity);
    expect(await store.getSession("nobody")).toBeNull();
    expect(await store.getAllPreKeys()).toEqual([]);
  });
});
