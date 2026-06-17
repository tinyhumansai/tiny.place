import assert from "node:assert/strict";
import test from "node:test";

import type { TinyPlaceClient } from "@tinyhumansai/tinyplace";

import { isPublicKey, resolveRecipientKey } from "./messaging.js";

const RAW_KEY = "WM8smAepeXnyL8+36sM0I3a/dfE5RkxJ66w3eXIrOSM=";
const CRYPTO_ID = "57mjBDibe6f6Vqv9uvhB6nckcz6cKwSCqt4Lio1DawJh";
const ENC_KEY = "PSrOROSZtKSyUbKZzlyEal05zhM7VJOIRv+NBCW1sII=";

test("isPublicKey accepts a base64 32-byte key (44 chars, trailing =)", () => {
  assert.equal(isPublicKey(RAW_KEY), true);
});

test("isPublicKey rejects a base58 cryptoId (no trailing =)", () => {
  // Regression: a base58 cryptoId is ~44 chars of [A-Za-z0-9] and used to be
  // misread as a raw key, sending the bundle fetch to /keys/<cryptoId>/bundle.
  assert.equal(isPublicKey(CRYPTO_ID), false);
});

test("isPublicKey rejects a @handle", () => {
  assert.equal(isPublicKey("@openclawtest"), false);
});

test("resolveRecipientKey passes a raw base64 key through untouched", async () => {
  const client = {
    directory: {
      getAgent: (): never => {
        throw new Error("should not be called for a raw key");
      },
    },
  } as unknown as TinyPlaceClient;
  assert.equal(await resolveRecipientKey(client, RAW_KEY), RAW_KEY);
});

test("resolveRecipientKey resolves a base58 cryptoId via the directory card", async () => {
  let asked = "";
  const client = {
    directory: {
      getAgent: (id: string): Promise<unknown> => {
        asked = id;
        return Promise.resolve({
          agentId: CRYPTO_ID,
          publicKey: ENC_KEY,
          metadata: { encryptionPublicKey: ENC_KEY },
        });
      },
    },
  } as unknown as TinyPlaceClient;
  assert.equal(await resolveRecipientKey(client, CRYPTO_ID), ENC_KEY);
  assert.equal(asked, CRYPTO_ID);
});

test("resolveRecipientKey resolves a @handle via directory.resolve", async () => {
  const client = {
    directory: {
      resolve: (name: string): Promise<unknown> => {
        assert.equal(name, "@openclawtest");
        return Promise.resolve({
          identity: { publicKey: "ignored" },
          agent: {
            agentId: CRYPTO_ID,
            publicKey: ENC_KEY,
            metadata: { encryptionPublicKey: ENC_KEY },
          },
        });
      },
    },
  } as unknown as TinyPlaceClient;
  assert.equal(await resolveRecipientKey(client, "@openclawtest"), ENC_KEY);
});

test("resolveRecipientKey normalizes a bare handle (no @) and resolves it", async () => {
  // Regression: a bare registered handle like "iris" must NOT be treated as a
  // cryptoId/agentId — it is normalized to "@iris" and resolved.
  let resolvedName = "";
  const client = {
    directory: {
      resolve: (name: string): Promise<unknown> => {
        resolvedName = name;
        return Promise.resolve({
          identity: { publicKey: "ignored" },
          agent: {
            agentId: CRYPTO_ID,
            publicKey: ENC_KEY,
            metadata: { encryptionPublicKey: ENC_KEY },
          },
        });
      },
      getAgent: (): never => {
        throw new Error("a bare handle must not hit getAgent");
      },
    },
  } as unknown as TinyPlaceClient;
  assert.equal(await resolveRecipientKey(client, "iris"), ENC_KEY);
  assert.equal(resolvedName, "@iris");
});

test("resolveRecipientKey falls back to the card's own publicKey when no encryption key is advertised", async () => {
  const client = {
    directory: {
      getAgent: (): Promise<unknown> =>
        Promise.resolve({ agentId: CRYPTO_ID, publicKey: ENC_KEY }),
    },
  } as unknown as TinyPlaceClient;
  assert.equal(await resolveRecipientKey(client, CRYPTO_ID), ENC_KEY);
});
