// Cross-language interop vector generator for the tiny.place Signal port.
//
// PROVENANCE: this script imports and executes the REAL flagship TypeScript
// Signal implementation in `sdk/typescript/src/signal/*.ts` (the only SDK with
// full Signal E2E crypto), compiled verbatim with the SDK's own `tsc`. The
// modules pull their primitives from `@noble/curves` and `@noble/hashes`. The
// emitted vectors are therefore genuine TypeScript-SDK output, NOT values
// recomputed from the Python port. The companion Python test
// `tests/test_signal_interop.py` pins these vectors and asserts the Python
// implementation reproduces / consumes them byte-for-byte.
//
// Reproduce (from sdk/typescript):
//   npm install --no-save @noble/curves@^2.2.0 @noble/hashes@^2.2.0
//   node_modules/.bin/tsc src/signal/*.ts --outDir .sigbuild --module ESNext \
//     --target ES2020 --moduleResolution bundler --skipLibCheck --declaration false
//   node ../python/tests/vectors/gen_signal_vectors.mjs > \
//     ../python/tests/vectors/signal_vectors.json
//
// `.sigbuild/` and `node_modules/` are transient (never committed); only this
// script and its JSON output are versioned. All inputs are fixed (no randomness)
// so the committed JSON is fully reproducible.

// @noble + the compiled signal modules live under sdk/typescript (transient,
// see the reproduce note). Resolve them via paths relative to this script so
// the generator runs regardless of the process cwd.
import { x25519, ed25519 } from "../../../typescript/node_modules/@noble/curves/ed25519.js";

import {
  kdfRootKey,
  kdfChainKey,
  deriveMessageKeys,
  x25519SharedSecret,
  encrypt,
  decrypt,
  computeHmac,
  toBase64,
} from "../../../typescript/.sigbuild/signal/crypto.js";
import { x3dhRespond } from "../../../typescript/.sigbuild/signal/x3dh.js";
import { ratchetEncrypt, ratchetDecrypt } from "../../../typescript/.sigbuild/signal/ratchet.js";
import {
  GroupSenderKey,
  GroupSenderKeyReceiver,
} from "../../../typescript/.sigbuild/signal/sender-key.js";

const hex = (u8) => Buffer.from(u8).toString("hex");
const fromHex = (h) => Uint8Array.from(Buffer.from(h, "hex"));
const utf8 = (s) => new TextEncoder().encode(s);

// Deterministic 32-byte filler.
const fill = (b) => new Uint8Array(32).fill(b);

const X3DH_INFO = utf8("WhisperText");
const PADDING = new Uint8Array(32).fill(0xff);

function concat(...arrays) {
  let total = 0;
  for (const a of arrays) total += a.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

// X25519 keypair from a fixed 32-byte private scalar (clamped by getPublicKey).
function x25519Pair(priv) {
  return { privateKey: priv, publicKey: x25519.getPublicKey(priv) };
}

const vectors = {};

// --------------------------------------------------------------------------
// 1. crypto KDFs / AEAD primitives (pure functions, exact byte compare)
// --------------------------------------------------------------------------
{
  const rootKey = fill(0x11);
  const dhOutput = fill(0x22);
  const { rootKey: nextRoot, chainKey } = kdfRootKey(rootKey, dhOutput);

  const chainIn = fill(0x33);
  const ck = kdfChainKey(chainIn);

  const messageKey = fill(0x44);
  const mk = deriveMessageKeys(messageKey);

  const hmacKey = fill(0x55);
  const hmacData = utf8("tiny.place signal interop");

  const aeadMessageKey = fill(0x66);
  const aeadPlaintext = utf8("hello from the TypeScript SDK \u{1f510}");
  const aeadAd = utf8("associated-data");
  const aeadCt = await encrypt(aeadMessageKey, aeadPlaintext, aeadAd);

  // Empty-plaintext edge case (PKCS#7 pads a full block).
  const emptyCt = await encrypt(aeadMessageKey, new Uint8Array(0), new Uint8Array(0));

  vectors.crypto = {
    kdf_root_key: {
      root_key: hex(rootKey),
      dh_output: hex(dhOutput),
      next_root_key: hex(nextRoot),
      chain_key: hex(chainKey),
    },
    kdf_chain_key: {
      chain_key_in: hex(chainIn),
      next_chain_key: hex(ck.chainKey),
      message_key: hex(ck.messageKey),
    },
    derive_message_keys: {
      message_key: hex(messageKey),
      enc_key: hex(mk.encKey),
      mac_key: hex(mk.macKey),
      iv: hex(mk.iv),
    },
    compute_hmac: {
      key: hex(hmacKey),
      data: hex(hmacData),
      mac: hex(computeHmac(hmacKey, hmacData)),
    },
    aead: {
      message_key: hex(aeadMessageKey),
      plaintext: hex(aeadPlaintext),
      associated_data: hex(aeadAd),
      ciphertext: hex(aeadCt),
    },
    aead_empty: {
      message_key: hex(aeadMessageKey),
      plaintext: "",
      associated_data: "",
      ciphertext: hex(emptyCt),
    },
  };
}

// --------------------------------------------------------------------------
// 2. X3DH shared secret (initiator math, deterministic via fixed ephemeral)
// --------------------------------------------------------------------------
// x3dhInitiate() generates a random ephemeral internally, so we reproduce the
// exact initiator computation here using the real DH + HKDF primitives with a
// FIXED ephemeral, and additionally drive the real x3dhRespond() to prove both
// directions reach the same secret.
{
  const aliceIdentity = x25519Pair(fill(0xa1));
  const aliceEphemeral = x25519Pair(fill(0xa2));
  const bobIdentity = x25519Pair(fill(0xb1));
  const bobSignedPreKey = x25519Pair(fill(0xb2));
  const bobOneTimePreKey = x25519Pair(fill(0xb3));

  // Initiator side, with one-time pre-key (4 DHs).
  const dh1 = x25519SharedSecret(aliceIdentity.privateKey, bobSignedPreKey.publicKey);
  const dh2 = x25519SharedSecret(aliceEphemeral.privateKey, bobIdentity.publicKey);
  const dh3 = x25519SharedSecret(aliceEphemeral.privateKey, bobSignedPreKey.publicKey);
  const dh4 = x25519SharedSecret(aliceEphemeral.privateKey, bobOneTimePreKey.publicKey);
  const concat4 = concat(PADDING, dh1, dh2, dh3, dh4);
  const { hkdf } = await import("../../../typescript/node_modules/@noble/hashes/hkdf.js");
  const { sha256 } = await import("../../../typescript/node_modules/@noble/hashes/sha2.js");
  const secretWithOtk = hkdf(sha256, concat4, new Uint8Array(32), X3DH_INFO, 32);

  // Without one-time pre-key (3 DHs).
  const concat3 = concat(PADDING, dh1, dh2, dh3);
  const secretNoOtk = hkdf(sha256, concat3, new Uint8Array(32), X3DH_INFO, 32);

  // Drive the REAL responder to confirm reciprocity (Bob recomputes Alice's secret).
  const bobSession = x3dhRespond(
    bobIdentity,
    bobSignedPreKey,
    aliceIdentity.publicKey,
    aliceEphemeral.publicKey,
    bobOneTimePreKey,
  );

  vectors.x3dh = {
    alice_identity_priv: hex(aliceIdentity.privateKey),
    alice_identity_pub: hex(aliceIdentity.publicKey),
    alice_ephemeral_priv: hex(aliceEphemeral.privateKey),
    alice_ephemeral_pub: hex(aliceEphemeral.publicKey),
    bob_identity_priv: hex(bobIdentity.privateKey),
    bob_identity_pub: hex(bobIdentity.publicKey),
    bob_signed_pre_key_priv: hex(bobSignedPreKey.privateKey),
    bob_signed_pre_key_pub: hex(bobSignedPreKey.publicKey),
    bob_one_time_pre_key_priv: hex(bobOneTimePreKey.privateKey),
    bob_one_time_pre_key_pub: hex(bobOneTimePreKey.publicKey),
    shared_secret_with_otk: hex(secretWithOtk),
    shared_secret_no_otk: hex(secretNoOtk),
    // The responder must reach the identical secret.
    responder_root_key_with_otk: hex(bobSession.rootKey),
  };
}

// --------------------------------------------------------------------------
// 3. Double Ratchet: Alice encrypts -> vector; Bob (Python) decrypts.
// --------------------------------------------------------------------------
// Build deterministic, symmetric initial sessions (shared root key, Alice's
// ratchet keypair fixed, Bob holds Alice's public key as dhRecvPublicKey). The
// first ratchetEncrypt runs the deterministic initial DH-ratchet step (no key
// generation), so the produced messages are fully reproducible.
{
  const rootKey = fill(0x77);
  const aliceRatchet = x25519Pair(fill(0xc1));
  const associatedData = utf8("alice->bob");

  // Alice's sending session: she sends first, so she needs Bob's recv key.
  // Mirror x3dhInitiate's handoff: dhRecvPublicKey = Bob's signed pre-key.
  const bobRatchet = x25519Pair(fill(0xc2));

  const aliceSession = {
    dhSendKeyPair: aliceRatchet,
    dhRecvPublicKey: bobRatchet.publicKey,
    rootKey: rootKey,
    sendChainKey: null,
    recvChainKey: null,
    sendMessageNumber: 0,
    recvMessageNumber: 0,
    previousChainLength: 0,
    skippedKeys: new Map(),
  };

  const plaintexts = ["ratchet message one", "second message", "third \u{1f680}"];
  const messages = [];
  for (const p of plaintexts) {
    const m = await ratchetEncrypt(aliceSession, utf8(p), associatedData);
    messages.push({
      plaintext: hex(utf8(p)),
      header_public_key: hex(m.header.publicKey),
      header_previous_chain_length: m.header.previousChainLength,
      header_message_number: m.header.messageNumber,
      ciphertext: hex(m.ciphertext),
    });
  }

  // Reverse direction: have Bob decrypt the first message with the REAL TS
  // ratchetDecrypt to prove the chosen initial state is self-consistent, then
  // record nothing extra (Python re-derives Bob's state identically).
  const bobSession = {
    dhSendKeyPair: bobRatchet,
    dhRecvPublicKey: null,
    rootKey: rootKey,
    sendChainKey: null,
    recvChainKey: null,
    sendMessageNumber: 0,
    recvMessageNumber: 0,
    previousChainLength: 0,
    skippedKeys: new Map(),
  };
  const first = messages[0];
  const decoded = await ratchetDecrypt(
    bobSession,
    {
      header: {
        publicKey: fromHex(first.header_public_key),
        previousChainLength: first.header_previous_chain_length,
        messageNumber: first.header_message_number,
      },
      ciphertext: fromHex(first.ciphertext),
    },
    associatedData,
  );
  if (Buffer.from(decoded).toString("utf8") !== plaintexts[0]) {
    throw new Error("TS ratchet self-check failed");
  }

  vectors.ratchet = {
    root_key: hex(rootKey),
    alice_ratchet_priv: hex(aliceRatchet.privateKey),
    alice_ratchet_pub: hex(aliceRatchet.publicKey),
    bob_ratchet_priv: hex(bobRatchet.privateKey),
    bob_ratchet_pub: hex(bobRatchet.publicKey),
    associated_data: hex(associatedData),
    messages,
  };
}

// --------------------------------------------------------------------------
// 4. Sender Keys (group messaging): real GroupSenderKey encrypt + sign.
// --------------------------------------------------------------------------
// GroupSenderKey.create() randomizes, so build a deterministic instance from a
// fixed serialized state (the public restore() path), then encrypt a few
// messages. Python's receiver decrypts from the same distribution.
{
  const chainKey = fill(0xd1);
  const signingSeed = fill(0xd2); // ed25519 secret key (noble: 32-byte seed)
  const signingPub = ed25519.getPublicKey(signingSeed);

  const sender = GroupSenderKey.restore({
    chainKey: toBase64(chainKey),
    iteration: 0,
    signaturePrivateKey: toBase64(signingSeed),
    signaturePublicKey: toBase64(signingPub),
  });

  const distribution = sender.distribution();

  const plaintexts = ["group hello", "group second", "group third"];
  const messages = [];
  for (const p of plaintexts) {
    const m = await sender.encrypt(utf8(p));
    messages.push({
      plaintext: hex(utf8(p)),
      iteration: m.iteration,
      ciphertext_b64: m.ciphertext,
      signature_b64: m.signature,
    });
  }

  // Self-check with the real receiver.
  const receiver = GroupSenderKeyReceiver.fromDistribution(distribution);
  for (let i = 0; i < messages.length; i++) {
    const pt = await receiver.decrypt({
      iteration: messages[i].iteration,
      ciphertext: messages[i].ciphertext_b64,
      signature: messages[i].signature_b64,
    });
    if (Buffer.from(pt).toString("utf8") !== plaintexts[i]) {
      throw new Error("TS sender-key self-check failed");
    }
  }

  vectors.sender_key = {
    chain_key: hex(chainKey),
    signing_seed: hex(signingSeed),
    signing_public_key: hex(signingPub),
    distribution: {
      chain_key_b64: distribution.chainKey,
      iteration: distribution.iteration,
      signature_public_key_b64: distribution.signaturePublicKey,
    },
    messages,
  };
}

process.stdout.write(JSON.stringify(vectors, null, 2) + "\n");
