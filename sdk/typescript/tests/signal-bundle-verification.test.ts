import { describe, it, expect } from "vitest";
import { generateX25519KeyPair, toBase64 } from "../src/signal/crypto.js";
import { MemorySessionStore } from "../src/signal/memory-store.js";
import { SignalSession } from "../src/signal/session.js";
import { verifyPreKeySignature } from "../src/signal/x3dh.js";
import { LocalSigner } from "../src/local-signer.js";
import type { KeyBundle } from "../src/types/index.js";

/**
 * Regression coverage for the X3DH signed pre-key signature verification fix.
 *
 * Before the fix, parseKeyBundle()/x3dhInitiate() consumed a fetched key bundle
 * without ever verifying the Ed25519 signature over the signed pre-key, letting a
 * malicious/compromised relay substitute attacker-controlled pre-keys (MITM /
 * pre-key substitution). These tests assert that a VALID bundle still establishes a
 * session, and that a TAMPERED bundle (bad signature or substituted pre-key) is
 * rejected.
 */

interface BobMaterial {
  signer: LocalSigner;
  identity: ReturnType<typeof generateX25519KeyPair>;
  signedPreKey: ReturnType<typeof generateX25519KeyPair>;
  oneTimePreKey: ReturnType<typeof generateX25519KeyPair>;
  store: MemorySessionStore;
}

async function buildBob(): Promise<BobMaterial> {
  const signer = await LocalSigner.generate();
  const identity = generateX25519KeyPair();
  const signedPreKey = generateX25519KeyPair();
  const oneTimePreKey = generateX25519KeyPair();
  const store = new MemorySessionStore(identity);

  // Backend construction: sign the UTF-8 bytes of base64(X25519 public key).
  const signSpk = await signer.sign(
    new TextEncoder().encode(toBase64(signedPreKey.publicKey)),
  );
  const signOpk = await signer.sign(
    new TextEncoder().encode(toBase64(oneTimePreKey.publicKey)),
  );

  await store.storeSignedPreKey({
    keyId: "spk_1",
    keyPair: signedPreKey,
    signature: signSpk,
  });
  await store.storePreKey({
    keyId: "opk_1",
    keyPair: oneTimePreKey,
    signature: signOpk,
  });

  return { signer, identity, signedPreKey, oneTimePreKey, store };
}

describe("X3DH key bundle signed pre-key verification", () => {
  it("establishes a session for a bundle with a valid signed pre-key signature", async () => {
    const bob = await buildBob();
    const aliceIdentity = generateX25519KeyPair();
    const aliceStore = new MemorySessionStore(aliceIdentity);
    const aliceSignal = new SignalSession(aliceStore, aliceIdentity.publicKey);
    const bobSignal = new SignalSession(bob.store, bob.identity.publicKey);

    const signSpk = await bob.signer.sign(
      new TextEncoder().encode(toBase64(bob.signedPreKey.publicKey)),
    );
    const signOpk = await bob.signer.sign(
      new TextEncoder().encode(toBase64(bob.oneTimePreKey.publicKey)),
    );

    const bundle: KeyBundle = {
      agentId: "bob",
      identityKey: toBase64(bob.identity.publicKey),
      signedPreKey: {
        keyId: "spk_1",
        publicKey: toBase64(bob.signedPreKey.publicKey),
        signature: toBase64(signSpk),
      },
      oneTimePreKey: {
        keyId: "opk_1",
        publicKey: toBase64(bob.oneTimePreKey.publicKey),
        signature: toBase64(signOpk),
      },
      updatedAt: new Date().toISOString(),
    };

    const encrypted = await aliceSignal.encrypt(
      "bob",
      bob.identity.publicKey,
      new TextEncoder().encode("hello bob!"),
      bundle,
      bob.signer.publicKey,
    );

    expect(encrypted.type).toBe("PREKEY_BUNDLE");

    const envelope = {
      id: "msg_1",
      from: "alice",
      to: "bob",
      timestamp: new Date().toISOString(),
      deviceId: 1,
      type: encrypted.type,
      body: encrypted.body,
      signal: encrypted.signal,
    };
    const decrypted = await bobSignal.decrypt(
      "alice",
      aliceIdentity.publicKey,
      envelope,
    );
    expect(new TextDecoder().decode(decrypted)).toBe("hello bob!");
  });

  it("rejects a bundle whose signed pre-key was substituted by a relay", async () => {
    const bob = await buildBob();
    const aliceIdentity = generateX25519KeyPair();
    const aliceStore = new MemorySessionStore(aliceIdentity);
    const aliceSignal = new SignalSession(aliceStore, aliceIdentity.publicKey);

    // Attacker-controlled signed pre-key, but the (genuine) signature still covers
    // Bob's original pre-key -> signature no longer matches the served public key.
    const attackerSignedPreKey = generateX25519KeyPair();
    const genuineSignature = await bob.signer.sign(
      new TextEncoder().encode(toBase64(bob.signedPreKey.publicKey)),
    );

    const tamperedBundle: KeyBundle = {
      agentId: "bob",
      identityKey: toBase64(bob.identity.publicKey),
      signedPreKey: {
        keyId: "spk_1",
        publicKey: toBase64(attackerSignedPreKey.publicKey),
        signature: toBase64(genuineSignature),
      },
      updatedAt: new Date().toISOString(),
    };

    await expect(
      aliceSignal.encrypt(
        "bob",
        bob.identity.publicKey,
        new TextEncoder().encode("hello bob!"),
        tamperedBundle,
        bob.signer.publicKey,
      ),
    ).rejects.toThrow(/signature/i);
  });

  it("rejects a bundle whose signed pre-key signature bytes were tampered", async () => {
    const bob = await buildBob();
    const aliceIdentity = generateX25519KeyPair();
    const aliceStore = new MemorySessionStore(aliceIdentity);
    const aliceSignal = new SignalSession(aliceStore, aliceIdentity.publicKey);

    const genuineSignature = await bob.signer.sign(
      new TextEncoder().encode(toBase64(bob.signedPreKey.publicKey)),
    );
    const tamperedSignature = new Uint8Array(genuineSignature);
    tamperedSignature[0] = tamperedSignature[0]! ^ 0xff;

    const tamperedBundle: KeyBundle = {
      agentId: "bob",
      identityKey: toBase64(bob.identity.publicKey),
      signedPreKey: {
        keyId: "spk_1",
        publicKey: toBase64(bob.signedPreKey.publicKey),
        signature: toBase64(tamperedSignature),
      },
      updatedAt: new Date().toISOString(),
    };

    await expect(
      aliceSignal.encrypt(
        "bob",
        bob.identity.publicKey,
        new TextEncoder().encode("hello bob!"),
        tamperedBundle,
        bob.signer.publicKey,
      ),
    ).rejects.toThrow(/signature/i);
  });

  it("rejects a bundle with a missing signed pre-key signature", async () => {
    const bob = await buildBob();
    const aliceIdentity = generateX25519KeyPair();
    const aliceStore = new MemorySessionStore(aliceIdentity);
    const aliceSignal = new SignalSession(aliceStore, aliceIdentity.publicKey);

    const bundle: KeyBundle = {
      agentId: "bob",
      identityKey: toBase64(bob.identity.publicKey),
      signedPreKey: {
        keyId: "spk_1",
        publicKey: toBase64(bob.signedPreKey.publicKey),
      },
      updatedAt: new Date().toISOString(),
    };

    await expect(
      aliceSignal.encrypt(
        "bob",
        bob.identity.publicKey,
        new TextEncoder().encode("hello bob!"),
        bundle,
        bob.signer.publicKey,
      ),
    ).rejects.toThrow(/signature/i);
  });

  it("verifyPreKeySignature accepts a valid signature and rejects a forged one", async () => {
    const signer = await LocalSigner.generate();
    const preKey = generateX25519KeyPair();
    const publicKeyB64 = toBase64(preKey.publicKey);
    const signature = await signer.sign(new TextEncoder().encode(publicKeyB64));

    expect(() =>
      verifyPreKeySignature(
        signer.publicKey,
        publicKeyB64,
        toBase64(signature),
        "signed pre-key",
      ),
    ).not.toThrow();

    const otherSigner = await LocalSigner.generate();
    expect(() =>
      verifyPreKeySignature(
        otherSigner.publicKey,
        publicKeyB64,
        toBase64(signature),
        "signed pre-key",
      ),
    ).toThrow(/signature/i);
  });
});
