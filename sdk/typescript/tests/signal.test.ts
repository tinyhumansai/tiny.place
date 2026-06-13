import { describe, it, expect, beforeEach } from "vitest";
import {
  generateX25519KeyPair,
  x25519SharedSecret,
  kdfRootKey,
  kdfChainKey,
  deriveMessageKeys,
  encrypt,
  decrypt,
  ed25519SeedToX25519KeyPair,
  ed25519PubToX25519Pub,
  toBase64,
  fromBase64,
} from "../src/signal/crypto.js";
import type { X25519KeyPair } from "../src/signal/crypto.js";
import {
  x3dhInitiate,
  x3dhRespond,
  buildAssociatedData,
} from "../src/signal/x3dh.js";
import { ratchetEncrypt, ratchetDecrypt } from "../src/signal/ratchet.js";
import type { SessionState } from "../src/signal/store.js";
import { MemorySessionStore } from "../src/signal/memory-store.js";
import { SignalSession } from "../src/signal/session.js";
import {
  generateSignedPreKey,
  generatePreKeys,
  serializeSignedKey,
  serializePreKey,
} from "../src/signal/keys.js";
import { LocalSigner } from "../src/local-signer.js";
import type { KeyBundle } from "../src/types/index.js";

describe("signal crypto primitives", () => {
  it("generates X25519 key pairs", () => {
    const kp = generateX25519KeyPair();
    expect(kp.publicKey.length).toBe(32);
    expect(kp.privateKey.length).toBe(32);
  });

  it("computes shared secret", () => {
    const alice = generateX25519KeyPair();
    const bob = generateX25519KeyPair();
    const sharedA = x25519SharedSecret(alice.privateKey, bob.publicKey);
    const sharedB = x25519SharedSecret(bob.privateKey, alice.publicKey);
    expect(toBase64(sharedA)).toBe(toBase64(sharedB));
  });

  it("KDF root key produces 32-byte outputs", () => {
    const rk = new Uint8Array(32).fill(1);
    const dh = new Uint8Array(32).fill(2);
    const result = kdfRootKey(rk, dh);
    expect(result.rootKey.length).toBe(32);
    expect(result.chainKey.length).toBe(32);
  });

  it("KDF chain key produces different chain and message keys", () => {
    const ck = new Uint8Array(32).fill(3);
    const result = kdfChainKey(ck);
    expect(result.chainKey.length).toBe(32);
    expect(result.messageKey.length).toBe(32);
    expect(toBase64(result.chainKey)).not.toBe(toBase64(result.messageKey));
  });

  it("derives enc, mac, and iv from message key", () => {
    const mk = new Uint8Array(32).fill(4);
    const keys = deriveMessageKeys(mk);
    expect(keys.encKey.length).toBe(32);
    expect(keys.macKey.length).toBe(32);
    expect(keys.iv.length).toBe(16);
  });

  it("encrypts and decrypts with message key", async () => {
    const mk = new Uint8Array(32).fill(5);
    const plaintext = new TextEncoder().encode("hello world");
    const ad = new Uint8Array(64).fill(0);
    const ciphertext = await encrypt(mk, plaintext, ad);
    const decrypted = await decrypt(mk, ciphertext, ad);
    expect(new TextDecoder().decode(decrypted)).toBe("hello world");
  });

  it("rejects tampered ciphertext", async () => {
    const mk = new Uint8Array(32).fill(6);
    const plaintext = new TextEncoder().encode("test");
    const ad = new Uint8Array(64);
    const ciphertext = await encrypt(mk, plaintext, ad);
    ciphertext[0]! ^= 0xff;
    await expect(decrypt(mk, ciphertext, ad)).rejects.toThrow("MAC verification failed");
  });

  it("base64 round-trips", () => {
    const bytes = new Uint8Array([1, 2, 3, 255, 0, 128]);
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
  });

  it("derives X25519 from Ed25519 seed deterministically", () => {
    const seed = new Uint8Array(32).fill(7);
    const kp1 = ed25519SeedToX25519KeyPair(seed);
    const kp2 = ed25519SeedToX25519KeyPair(seed);
    expect(toBase64(kp1.publicKey)).toBe(toBase64(kp2.publicKey));
    expect(toBase64(kp1.privateKey)).toBe(toBase64(kp2.privateKey));
  });
});

describe("X3DH key agreement", () => {
  it("initiator and responder derive the same shared secret", () => {
    const aliceIdentity = generateX25519KeyPair();
    const bobIdentity = generateX25519KeyPair();
    const bobSignedPreKey = generateX25519KeyPair();
    const bobOneTimePreKey = generateX25519KeyPair();

    const initResult = x3dhInitiate(aliceIdentity, {
      identityKey: bobIdentity.publicKey,
      signedPreKeyId: "spk_1",
      signedPreKey: bobSignedPreKey.publicKey,
      oneTimePreKeyId: "opk_1",
      oneTimePreKey: bobOneTimePreKey.publicKey,
    });

    const bobSession = x3dhRespond(
      bobIdentity,
      bobSignedPreKey,
      aliceIdentity.publicKey,
      initResult.ephemeralPublicKey,
      bobOneTimePreKey,
    );

    expect(toBase64(initResult.session.rootKey)).toBe(toBase64(bobSession.rootKey));
  });

  it("works without one-time pre-key", () => {
    const aliceIdentity = generateX25519KeyPair();
    const bobIdentity = generateX25519KeyPair();
    const bobSignedPreKey = generateX25519KeyPair();

    const initResult = x3dhInitiate(aliceIdentity, {
      identityKey: bobIdentity.publicKey,
      signedPreKeyId: "spk_1",
      signedPreKey: bobSignedPreKey.publicKey,
    });

    const bobSession = x3dhRespond(
      bobIdentity,
      bobSignedPreKey,
      aliceIdentity.publicKey,
      initResult.ephemeralPublicKey,
    );

    expect(toBase64(initResult.session.rootKey)).toBe(toBase64(bobSession.rootKey));
  });
});

describe("Double Ratchet", () => {
  let aliceSession: SessionState;
  let bobSession: SessionState;
  let ad: Uint8Array;

  beforeEach(() => {
    const aliceIdentity = generateX25519KeyPair();
    const bobIdentity = generateX25519KeyPair();
    const bobSignedPreKey = generateX25519KeyPair();

    const initResult = x3dhInitiate(aliceIdentity, {
      identityKey: bobIdentity.publicKey,
      signedPreKeyId: "spk_1",
      signedPreKey: bobSignedPreKey.publicKey,
    });

    aliceSession = initResult.session;
    bobSession = x3dhRespond(
      bobIdentity,
      bobSignedPreKey,
      aliceIdentity.publicKey,
      initResult.ephemeralPublicKey,
    );

    ad = buildAssociatedData(aliceIdentity.publicKey, bobIdentity.publicKey);
  });

  it("encrypts and decrypts a single message", async () => {
    const plaintext = new TextEncoder().encode("hello bob");
    const message = await ratchetEncrypt(aliceSession, plaintext, ad);

    const adBob = buildAssociatedData(
      ad.slice(0, 32),
      ad.slice(32),
    );
    const decrypted = await ratchetDecrypt(bobSession, message, adBob);
    expect(new TextDecoder().decode(decrypted)).toBe("hello bob");
  });

  it("handles multiple messages in sequence", async () => {
    const adBob = buildAssociatedData(ad.slice(0, 32), ad.slice(32));

    for (let i = 0; i < 5; i++) {
      const plaintext = new TextEncoder().encode(`message ${i}`);
      const message = await ratchetEncrypt(aliceSession, plaintext, ad);
      const decrypted = await ratchetDecrypt(bobSession, message, adBob);
      expect(new TextDecoder().decode(decrypted)).toBe(`message ${i}`);
    }
  });

  it("handles back-and-forth conversation", async () => {
    const adBob = buildAssociatedData(ad.slice(0, 32), ad.slice(32));

    const msg1 = await ratchetEncrypt(aliceSession, new TextEncoder().encode("hello"), ad);
    const dec1 = await ratchetDecrypt(bobSession, msg1, adBob);
    expect(new TextDecoder().decode(dec1)).toBe("hello");

    const msg2 = await ratchetEncrypt(bobSession, new TextEncoder().encode("hi back"), adBob);
    const dec2 = await ratchetDecrypt(aliceSession, msg2, ad);
    expect(new TextDecoder().decode(dec2)).toBe("hi back");

    const msg3 = await ratchetEncrypt(aliceSession, new TextEncoder().encode("third"), ad);
    const dec3 = await ratchetDecrypt(bobSession, msg3, adBob);
    expect(new TextDecoder().decode(dec3)).toBe("third");
  });

  it("handles out-of-order messages via skipped keys", async () => {
    const adBob = buildAssociatedData(ad.slice(0, 32), ad.slice(32));

    const msg0 = await ratchetEncrypt(aliceSession, new TextEncoder().encode("first"), ad);
    const msg1 = await ratchetEncrypt(aliceSession, new TextEncoder().encode("second"), ad);
    const msg2 = await ratchetEncrypt(aliceSession, new TextEncoder().encode("third"), ad);

    const dec2 = await ratchetDecrypt(bobSession, msg2, adBob);
    expect(new TextDecoder().decode(dec2)).toBe("third");

    const dec0 = await ratchetDecrypt(bobSession, msg0, adBob);
    expect(new TextDecoder().decode(dec0)).toBe("first");

    const dec1 = await ratchetDecrypt(bobSession, msg1, adBob);
    expect(new TextDecoder().decode(dec1)).toBe("second");
  });
});

describe("SignalSession with MemorySessionStore", () => {
  it("full encrypt/decrypt flow between two parties", async () => {
    const aliceIdentity = generateX25519KeyPair();
    const bobIdentity = generateX25519KeyPair();
    const bobSignedPreKey = generateX25519KeyPair();
    const bobOneTimePreKey = generateX25519KeyPair();

    const aliceStore = new MemorySessionStore(aliceIdentity);
    const bobStore = new MemorySessionStore(bobIdentity);

    const signer = await LocalSigner.generate();
    // The backend signs base64(X25519 publicKey) with the Ed25519 identity key,
    // so the bundle signatures must cover the exact pre-key bytes Alice consumes.
    const signSpk = await signer.sign(
      new TextEncoder().encode(toBase64(bobSignedPreKey.publicKey)),
    );
    const signOpk = await signer.sign(
      new TextEncoder().encode(toBase64(bobOneTimePreKey.publicKey)),
    );

    await bobStore.storeSignedPreKey({
      keyId: "spk_1",
      keyPair: bobSignedPreKey,
      signature: signSpk,
    });
    await bobStore.storePreKey({ keyId: "opk_1", keyPair: bobOneTimePreKey, signature: signOpk });

    const aliceSignal = new SignalSession(aliceStore, aliceIdentity.publicKey);
    const bobSignal = new SignalSession(bobStore, bobIdentity.publicKey);

    const bundle: KeyBundle = {
      agentId: "bob",
      identityKey: toBase64(bobIdentity.publicKey),
      signedPreKey: {
        keyId: "spk_1",
        publicKey: toBase64(bobSignedPreKey.publicKey),
        signature: toBase64(signSpk),
      },
      oneTimePreKey: {
        keyId: "opk_1",
        publicKey: toBase64(bobOneTimePreKey.publicKey),
        signature: toBase64(signOpk),
      },
      updatedAt: new Date().toISOString(),
    };

    const encrypted = await aliceSignal.encrypt(
      "bob",
      bobIdentity.publicKey,
      new TextEncoder().encode("hello bob!"),
      bundle,
      signer.publicKey,
    );

    expect(encrypted.type).toBe("PREKEY_BUNDLE");
    expect(encrypted.signal?.ephemeralKey).toBeDefined();
    expect(encrypted.signal?.signedPreKeyId).toBe("spk_1");

    const envelope = {
      id: "msg_1",
      from: "alice",
      to: "bob",
      timestamp: new Date().toISOString(),
      deviceId: 1,
      type: encrypted.type as "CIPHERTEXT" | "PREKEY_BUNDLE",
      body: encrypted.body,
      signal: encrypted.signal,
    };

    const decrypted = await bobSignal.decrypt("alice", aliceIdentity.publicKey, envelope);
    expect(new TextDecoder().decode(decrypted)).toBe("hello bob!");
  });
});

describe("LocalSigner X25519 derivation", () => {
  it("derives deterministic X25519 key pair", async () => {
    const signer = await LocalSigner.generate();
    const kp1 = await signer.getX25519KeyPair();
    const kp2 = await signer.getX25519KeyPair();
    expect(kp1.publicKey.length).toBe(32);
    expect(kp1.privateKey.length).toBe(32);
    expect(toBase64(kp1.publicKey)).toBe(toBase64(kp2.publicKey));
  });

  it("derived key pair works for X25519 ECDH", async () => {
    const signer1 = await LocalSigner.generate();
    const signer2 = await LocalSigner.generate();
    const kp1 = await signer1.getX25519KeyPair();
    const kp2 = await signer2.getX25519KeyPair();
    const shared1 = x25519SharedSecret(kp1.privateKey, kp2.publicKey);
    const shared2 = x25519SharedSecret(kp2.privateKey, kp1.publicKey);
    expect(toBase64(shared1)).toBe(toBase64(shared2));
  });

  it("ed25519PubToX25519Pub matches seed-derived public key", async () => {
    const signer = await LocalSigner.generate();
    const fromSeed = await signer.getX25519KeyPair();
    const fromPub = ed25519PubToX25519Pub(signer.publicKey);
    expect(toBase64(fromSeed.publicKey)).toBe(toBase64(fromPub));
  });
});

describe("key generation helpers", () => {
  it("generates signed pre-key with valid signature", async () => {
    const signer = await LocalSigner.generate();
    const spk = await generateSignedPreKey(signer, "spk_test");
    expect(spk.keyId).toBe("spk_test");
    expect(spk.keyPair.publicKey.length).toBe(32);
    expect(spk.signature.length).toBe(64);
    const serialized = serializeSignedKey(spk);
    expect(serialized.keyId).toBe("spk_test");
    expect(typeof serialized.publicKey).toBe("string");
    expect(typeof serialized.signature).toBe("string");
  });

  it("generates batch of pre-keys", async () => {
    const signer = await LocalSigner.generate();
    const preKeys = await generatePreKeys(signer, 1, 10);
    expect(preKeys.length).toBe(10);
    expect(preKeys[0]!.keyId).toBe("pk_1");
    expect(preKeys[9]!.keyId).toBe("pk_10");
    const serialized = serializePreKey(preKeys[0]!);
    expect(typeof serialized.publicKey).toBe("string");
    expect(typeof serialized.signature).toBe("string");
  });
});
