import assert from "node:assert/strict";
import test from "node:test";

import { fromBase64, toBase64 } from "@tinyhumansai/tinyplace";

import {
  decodeGroupBody,
  encodeGroupBody,
  groupSenderKeyId,
  parseGroupKeyDistribution,
  parseSenderKeyId,
} from "./group-messaging.js";

// --- groupSenderKeyId / parseSenderKeyId ---

test("groupSenderKeyId round-trips through parseSenderKeyId", () => {
  const id = groupSenderKeyId("g", "@s", 3);
  assert.equal(id, "g:@s:epoch:3");
  assert.deepEqual(parseSenderKeyId(id), { groupId: "g", sender: "@s", epoch: 3 });
});

test("parseSenderKeyId handles a sender containing a colon", () => {
  // groupId is the segment before the first colon; the rest up to :epoch: is sender.
  const id = groupSenderKeyId("group", "sender:with:colons", 7);
  assert.deepEqual(parseSenderKeyId(id), {
    groupId: "group",
    sender: "sender:with:colons",
    epoch: 7,
  });
});

test("parseSenderKeyId returns null when the :epoch: marker is missing", () => {
  assert.equal(parseSenderKeyId("g:@s:3"), null);
  assert.equal(parseSenderKeyId("no-separators-here"), null);
});

test("parseSenderKeyId returns null for a non-integer or negative epoch", () => {
  assert.equal(parseSenderKeyId("g:@s:epoch:abc"), null);
  assert.equal(parseSenderKeyId("g:@s:epoch:1.5"), null);
  assert.equal(parseSenderKeyId("g:@s:epoch:-1"), null);
});

test("parseSenderKeyId treats an empty epoch as 0 (Number(\"\") === 0)", () => {
  // The impl does `Number(id.slice(...))`; Number("") is 0, an integer >= 0,
  // so an empty epoch segment is accepted as epoch 0.
  assert.deepEqual(parseSenderKeyId("g:@s:epoch:"), {
    groupId: "g",
    sender: "@s",
    epoch: 0,
  });
});

test("parseSenderKeyId returns null when the group/sender separator is missing", () => {
  // No colon before :epoch: means there is no group/sender split.
  assert.equal(parseSenderKeyId("gonly:epoch:2"), null);
});

// --- parseGroupKeyDistribution ---

function distributionText(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    kind: "tinyplace/group-sender-key",
    groupId: "g1",
    sender: "@alice",
    epoch: 2,
    distribution: { chainKey: "k", iteration: 0, signaturePublicKey: "pk" },
    ...overrides,
  });
}

test("parseGroupKeyDistribution parses a well-formed handoff", () => {
  const payload = parseGroupKeyDistribution(distributionText());
  assert.ok(payload);
  assert.equal(payload?.kind, "tinyplace/group-sender-key");
  assert.equal(payload?.groupId, "g1");
  assert.equal(payload?.sender, "@alice");
  assert.equal(payload?.epoch, 2);
  assert.equal(typeof payload?.distribution, "object");
});

test("parseGroupKeyDistribution returns null for text not starting with {", () => {
  assert.equal(parseGroupKeyDistribution("hello"), null);
  assert.equal(parseGroupKeyDistribution(" {\"kind\":\"x\"}"), null);
});

test("parseGroupKeyDistribution returns null when the kind marker is absent", () => {
  assert.equal(parseGroupKeyDistribution(JSON.stringify({ groupId: "g" })), null);
});

test("parseGroupKeyDistribution returns null for invalid JSON", () => {
  // Starts with { and contains the marker substring, but is not valid JSON.
  assert.equal(
    parseGroupKeyDistribution('{"kind":"tinyplace/group-sender-key" '),
    null,
  );
});

test("parseGroupKeyDistribution returns null for the wrong kind", () => {
  // Must contain the marker substring to get past the cheap prefilter, then fail
  // the strict equality on `kind`.
  const text = JSON.stringify({
    kind: "tinyplace/group-sender-key-OTHER",
    note: "tinyplace/group-sender-key",
    groupId: "g",
    sender: "@s",
    epoch: 1,
    distribution: {},
  });
  assert.equal(parseGroupKeyDistribution(text), null);
});

test("parseGroupKeyDistribution returns null when fields are missing or mistyped", () => {
  assert.equal(parseGroupKeyDistribution(distributionText({ groupId: 123 })), null);
  assert.equal(parseGroupKeyDistribution(distributionText({ sender: 5 })), null);
  assert.equal(parseGroupKeyDistribution(distributionText({ epoch: "2" })), null);
  assert.equal(
    parseGroupKeyDistribution(distributionText({ distribution: "nope" })),
    null,
  );
  const missing = JSON.stringify({
    kind: "tinyplace/group-sender-key",
    sender: "@s",
    epoch: 1,
    distribution: {},
  });
  assert.equal(parseGroupKeyDistribution(missing), null);
});

test("parseGroupKeyDistribution rejects an empty or malformed distribution", () => {
  // `{}` passed the old `typeof === "object"` check; now it must carry a valid
  // chainKey / iteration / signaturePublicKey or it is not a handoff.
  assert.equal(parseGroupKeyDistribution(distributionText({ distribution: {} })), null);
  assert.equal(parseGroupKeyDistribution(distributionText({ distribution: null })), null);
  assert.equal(
    parseGroupKeyDistribution(
      distributionText({ distribution: { chainKey: "", iteration: 0, signaturePublicKey: "pk" } }),
    ),
    null,
  );
  assert.equal(
    parseGroupKeyDistribution(
      distributionText({ distribution: { chainKey: "k", iteration: "0", signaturePublicKey: "pk" } }),
    ),
    null,
  );
  assert.equal(
    parseGroupKeyDistribution(
      distributionText({ distribution: { chainKey: "k", iteration: 0 } }),
    ),
    null,
  );
  // A fully-formed distribution still parses.
  const ok = parseGroupKeyDistribution(distributionText());
  assert.ok(ok);
});

// --- encodeGroupBody / decodeGroupBody ---

function senderKeyMessage(
  ciphertextBytes: Uint8Array,
  iteration = 4,
): { iteration: number; ciphertext: string; signature: string } {
  const signature = new Uint8Array(64);
  for (let index = 0; index < 64; index += 1) signature[index] = index;
  return {
    iteration,
    ciphertext: toBase64(ciphertextBytes),
    signature: toBase64(signature),
  };
}

test("encodeGroupBody / decodeGroupBody round-trip a message", () => {
  const ciphertext = new Uint8Array([10, 20, 30, 40, 50]);
  const message = senderKeyMessage(ciphertext, 9);
  const body = encodeGroupBody(message);

  // version byte 0x01 + 64-byte signature + ciphertext.
  const raw = fromBase64(body);
  assert.equal(raw[0], 0x01);
  assert.equal(raw.length, 1 + 64 + ciphertext.length);

  const decoded = decodeGroupBody(body, 9);
  assert.ok(decoded);
  assert.equal(decoded?.iteration, 9);
  assert.equal(decoded?.ciphertext, message.ciphertext);
  assert.equal(decoded?.signature, message.signature);
});

test("decodeGroupBody returns null for a body shorter than 1 + 64 bytes", () => {
  const tooShort = toBase64(new Uint8Array(10));
  assert.equal(decodeGroupBody(tooShort, 0), null);
});

test("decodeGroupBody returns null for a wrong version byte", () => {
  const bytes = new Uint8Array(1 + 64 + 3);
  bytes[0] = 0x02; // wrong version
  assert.equal(decodeGroupBody(toBase64(bytes), 0), null);
});

test("decodeGroupBody returns null for non-base64 garbage", () => {
  assert.equal(decodeGroupBody("!!!not base64!!!", 0), null);
});
