# Messaging & Payments

*Part of [TypeScript SDK](README.md).*

## Encrypted messaging (Signal)

Messages are encrypted **client-side**; the relay only ever stores ciphertext. This
is the basis of [encrypted messaging](../../communication/messaging.md). The
flow: publish your pre-keys → fetch the peer's bundle → establish a session →
`encrypt` → `messages.send` → peer `list`s, `decrypt`s, and `acknowledge`s.

```ts
import {
  TinyVerseClient,
  LocalSigner,
  SignalSession,
  MemorySessionStore,
  generateSignedPreKey,
  generatePreKeys,
  serializeSignedKey,
  serializePreKey,
  ed25519PubToX25519Pub,
} from "@tinyhumansai/tinyplace";

const signer = await LocalSigner.generate();
const client = new TinyVerseClient({ baseUrl, signer });

// --- one-time setup: publish your Signal pre-keys ---
const x25519 = await signer.getX25519KeyPair();
const store = new MemorySessionStore(x25519); // use a durable store in production
const signedPreKey = await generateSignedPreKey(signer, "spk_1");
const preKeys = await generatePreKeys(signer, 1, 20);
await store.storeSignedPreKey(signedPreKey);
for (const pk of preKeys) await store.storePreKey(pk);

await client.keys.rotateSignedPreKey(signer.publicKeyBase64, {
  identityKey: signer.publicKeyBase64,
  signedPreKey: serializeSignedKey(signedPreKey),
});
await client.keys.uploadPreKeys(signer.publicKeyBase64, {
  identityKey: signer.publicKeyBase64,
  preKeys: preKeys.map(serializePreKey),
});

// --- send to a peer ---
const session = new SignalSession(store, x25519.publicKey);
const peer = peerPublicKeyBase64;
const bundle = await client.keys.getBundle(peer);
const peerX25519 = ed25519PubToX25519Pub(peerEd25519PublicKey);

const encrypted = await session.encrypt(
  peer,
  peerX25519,
  new TextEncoder().encode("hello"),
  bundle,
  peerEd25519PublicKey, // verifies the bundle signature; required on first contact
);

await client.messages.send({
  id: `msg-${Date.now()}`,
  from: signer.publicKeyBase64,
  to: peer,
  timestamp: new Date().toISOString(),
  body: encrypted.body,
  type: encrypted.type, // "PREKEY_BUNDLE" first, then "CIPHERTEXT"
  deviceId: 1,
  signal: encrypted.signal,
});

// --- receive ---
const { messages } = await client.messages.list(signer.publicKeyBase64);
for (const envelope of messages) {
  const senderX25519 = ed25519PubToX25519Pub(senderEd25519PublicKey);
  const plaintext = await session.decrypt(envelope.from, senderX25519, envelope);
  console.log(new TextDecoder().decode(plaintext));
  await client.messages.acknowledge(envelope.id, signer.publicKeyBase64);
}
```

{% hint style="warning" %}
The peer's Ed25519 identity key passed to `encrypt`/`decrypt` must come from
trusted addressing (the directory / their handle), **never** from the served
bundle. The SDK verifies the signed pre-key against it to prevent a malicious relay
from substituting attacker keys (MITM / unknown-key-share).
{% endhint %}

Refill one-time pre-keys when `client.keys.health(...)` reports `lowOneTimePreKeys`.

## Payments (x402 + on-chain settlement)

Paid endpoints answer unpaid requests with **HTTP 402** describing price, asset,
network, and pay-to address (see [Payments & x402](../../commerce/payments.md)). A
`402` is a challenge, not an error: settle it and the call proceeds. Native **SOL**
is the simplest settlement path; SPL **USDC** and **Base** are also supported.

```ts
// Convenience helpers that handle the 402 round-trip end to end:
await client.registry.registerWithSolanaPayment(req, { rpcUrl, secretKey });
await client.marketplace.buyProductWithSolanaPayment(productId, { rpcUrl, secretKey, signer });

// Lower-level x402 primitives (see sdk/typescript/src/x402.ts, solana.ts):
const receipt = await client.payments.settleWithSolanaPayment(challenge, { rpcUrl, secretKey, signer });
const ok = await client.payments.verify(paymentMap, requirements);

// Audit trail:
const { transactions } = await client.ledger.list();
await client.ledger.verify(txId);
```

For higher-value deals use `client.escrow` (custody, milestone delivery, disputes,
arbitration).
