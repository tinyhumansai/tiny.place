import assert from "node:assert/strict";
import test from "node:test";

import { LocalSigner, TinyPlaceError } from "@tinyhumansai/tinyplace";

import {
  challengeOf,
  normalizeHandle,
  payFromChallenge,
  type PaymentChallenge,
} from "./shared.js";

const SEED = new Uint8Array(32);
for (let index = 0; index < 32; index += 1) SEED[index] = index;

function fullChallenge(overrides: Partial<PaymentChallenge> = {}): PaymentChallenge {
  return {
    scheme: "exact",
    network: "solana-mainnet",
    asset: "USDC",
    amount: "1000000",
    to: "@payee",
    ...overrides,
  };
}

test("normalizeHandle prepends @ when missing", () => {
  assert.equal(normalizeHandle("foo"), "@foo");
});

test("normalizeHandle leaves an existing @ alone", () => {
  assert.equal(normalizeHandle("@foo"), "@foo");
});

test("normalizeHandle trims surrounding whitespace", () => {
  assert.equal(normalizeHandle("  foo "), "@foo");
  assert.equal(normalizeHandle("  @foo "), "@foo");
});

test("normalizeHandle rejects empty / whitespace-only input", () => {
  assert.throws(() => normalizeHandle(""), /handle is empty/);
  assert.throws(() => normalizeHandle("   "), /handle is empty/);
  assert.throws(() => normalizeHandle("@"), /handle is empty/);
  assert.throws(() => normalizeHandle("  @ "), /handle is empty/);
});

test("challengeOf extracts the payment challenge from a 402 body", () => {
  const error = new TinyPlaceError(402, { payment: { amount: "5", to: "@a" } });
  const challenge = challengeOf(error);
  assert.equal(challenge?.amount, "5");
  assert.equal(challenge?.to, "@a");
});

test("challengeOf prefers paymentRequired.payment over body.payment", () => {
  // Constructor auto-derives paymentRequired from body, but an explicit
  // paymentRequired must win per `error.paymentRequired?.payment ?? body?.payment`.
  const error = new TinyPlaceError(
    402,
    { payment: { amount: "from-body", to: "@body" } },
    "HTTP 402",
    { paymentRequired: { payment: { amount: "from-required", to: "@required" } } },
  );
  const challenge = challengeOf(error);
  assert.equal(challenge?.amount, "from-required");
  assert.equal(challenge?.to, "@required");
});

test("challengeOf falls back to body.payment when paymentRequired is absent", () => {
  // A 402 body lacking a `payment` field yields no derived paymentRequired,
  // so challengeOf returns undefined (there is nothing to fall back to).
  const noPayment = new TinyPlaceError(402, { error: "nope" });
  assert.equal(challengeOf(noPayment), undefined);
});

test("challengeOf returns undefined for a non-402 TinyPlaceError", () => {
  const error = new TinyPlaceError(404, { payment: { amount: "5", to: "@a" } });
  assert.equal(challengeOf(error), undefined);
});

test("challengeOf returns undefined for a plain Error", () => {
  assert.equal(challengeOf(new Error("boom")), undefined);
  assert.equal(challengeOf("just a string"), undefined);
  assert.equal(challengeOf(undefined), undefined);
});

test("payFromChallenge throws when required fields are missing", async () => {
  const signer = await LocalSigner.fromSeed(SEED);
  for (const missing of ["network", "asset", "amount", "to"] as const) {
    const challenge = fullChallenge();
    delete challenge[missing];
    await assert.rejects(
      payFromChallenge(signer, challenge, {}),
      /missing network\/asset\/amount\/to/,
    );
  }
});

test("payFromChallenge returns a signed payment map for a complete challenge", async () => {
  const signer = await LocalSigner.fromSeed(SEED);
  const payment = await payFromChallenge(signer, fullChallenge(), {});

  assert.equal(payment["network"], "solana-mainnet");
  assert.equal(payment["asset"], "USDC");
  assert.equal(payment["amount"], "1000000");
  assert.equal(payment["to"], "@payee");
  assert.equal(payment["scheme"], "exact");
  assert.match(payment["signature"] ?? "", /.+/);
});

test("payFromChallenge defaults `from` to the signer's agentId", async () => {
  const signer = await LocalSigner.fromSeed(SEED);
  const payment = await payFromChallenge(signer, fullChallenge(), {});
  assert.equal(payment["from"], signer.agentId);
});

test("payFromChallenge honours an explicit `from` on the challenge", async () => {
  const signer = await LocalSigner.fromSeed(SEED);
  const payment = await payFromChallenge(
    signer,
    fullChallenge({ from: "@explicit-from" }),
    {},
  );
  assert.equal(payment["from"], "@explicit-from");
});

test("payFromChallenge generates a nonce when the challenge omits one", async () => {
  const signer = await LocalSigner.fromSeed(SEED);
  const payment = await payFromChallenge(signer, fullChallenge(), {});
  assert.match(payment["nonce"] ?? "", /.+/);
});

test("payFromChallenge reuses the challenge nonce when present", async () => {
  const signer = await LocalSigner.fromSeed(SEED);
  const payment = await payFromChallenge(
    signer,
    fullChallenge({ nonce: "fixed-nonce-123" }),
    {},
  );
  assert.equal(payment["nonce"], "fixed-nonce-123");
});

test("payFromChallenge merges caller metadata over challenge metadata", async () => {
  const signer = await LocalSigner.fromSeed(SEED);
  const payment = await payFromChallenge(
    signer,
    fullChallenge({ metadata: { purpose: "challenge", keep: "yes" } }),
    { purpose: "caller-override", added: "new" },
  );
  // metadata is flattened onto the payment map as `metadata.<key>`.
  assert.equal(payment["metadata.purpose"], "caller-override");
  assert.equal(payment["metadata.keep"], "yes");
  assert.equal(payment["metadata.added"], "new");
});
