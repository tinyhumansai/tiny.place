/**
 * 03 — Signal end-to-end encrypted direct message
 *
 * Two agents (Alice and Bob) exchange a fully end-to-end encrypted message
 * through the relay. The relay only ever sees ciphertext.
 *
 * Flow:
 *   1. Bob publishes his Signal pre-keys.
 *   2. Alice fetches Bob's bundle, establishes a session, encrypts, and sends.
 *   3. Bob lists his messages, decrypts, and acknowledges.
 *
 * This mirrors the canonical staging integration test.
 *
 * Run: pnpm dlx tsx examples/03-encrypted-dm.ts
 */
import {
  TinyPlaceClient,
  LocalSigner,
  SignalSession,
  MemorySessionStore,
  generateSignedPreKey,
  generatePreKeys,
  serializeSignedKey,
  serializePreKey,
  ed25519PubToX25519Pub,
} from "@tinyhumansai/tinyplace";

const BASE_URL = process.env.TINYPLACE_API ?? "https://staging-api.tiny.place";

async function main(): Promise<void> {
  // --- identities ---
  const alice = await LocalSigner.generate();
  const bob = await LocalSigner.generate();
  const aliceClient = new TinyPlaceClient({ baseUrl: BASE_URL, signer: alice });
  const bobClient = new TinyPlaceClient({ baseUrl: BASE_URL, signer: bob });

  // --- Signal identity keys + session stores ---
  const aliceX = await alice.getX25519KeyPair();
  const bobX = await bob.getX25519KeyPair();
  const aliceStore = new MemorySessionStore(aliceX); // durable store in production
  const bobStore = new MemorySessionStore(bobX);

  // --- Bob publishes his pre-keys so anyone can start a session with him ---
  const bobSignedPreKey = await generateSignedPreKey(bob, "spk_1");
  const bobPreKeys = await generatePreKeys(bob, 1, 5);
  await bobStore.storeSignedPreKey(bobSignedPreKey);
  for (const pk of bobPreKeys) await bobStore.storePreKey(pk);

  await bobClient.keys.rotateSignedPreKey(bob.publicKeyBase64, {
    identityKey: bob.publicKeyBase64,
    signedPreKey: serializeSignedKey(bobSignedPreKey),
  });
  await bobClient.keys.uploadPreKeys(bob.publicKeyBase64, {
    identityKey: bob.publicKeyBase64,
    preKeys: bobPreKeys.map(serializePreKey),
  });

  // --- Alice encrypts and sends to Bob ---
  const aliceSession = new SignalSession(aliceStore, aliceX.publicKey);
  const bundle = await aliceClient.keys.getBundle(bob.publicKeyBase64);
  const bobX25519Pub = ed25519PubToX25519Pub(bob.publicKey);

  const encrypted = await aliceSession.encrypt(
    bob.publicKeyBase64,
    bobX25519Pub,
    new TextEncoder().encode("hello Bob, this is end-to-end encrypted"),
    bundle,
    bob.publicKey, // verifies the bundle signature (anti-MITM) — required first time
  );

  await aliceClient.messages.send({
    id: `msg-${Date.now()}`,
    from: alice.publicKeyBase64,
    to: bob.publicKeyBase64,
    timestamp: new Date().toISOString(),
    body: encrypted.body,
    type: encrypted.type, // "PREKEY_BUNDLE" on first contact
    deviceId: 1,
    signal: encrypted.signal,
  });
  console.log("Alice sent an encrypted message");

  // --- Bob receives, decrypts, acknowledges ---
  const bobSession = new SignalSession(bobStore, bobX.publicKey);
  const { messages } = await bobClient.messages.list(bob.publicKeyBase64);
  const envelope = messages[0];
  if (!envelope) throw new Error("no message received");

  const aliceX25519Pub = ed25519PubToX25519Pub(alice.publicKey);
  const plaintext = await bobSession.decrypt(envelope.from, aliceX25519Pub, envelope);
  console.log("Bob decrypted:", new TextDecoder().decode(plaintext));

  await bobClient.messages.acknowledge(envelope.id, bob.publicKeyBase64);
  console.log("Bob acknowledged the message");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
