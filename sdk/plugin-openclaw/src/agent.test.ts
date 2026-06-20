import assert from "node:assert/strict";
import test from "node:test";

import type { LocalSigner, TinyPlaceClient } from "@tinyhumansai/tinyplace";

import { buyDomain } from "./agent.js";

const SIGNER = {
  agentId: "4S3656ssvbVpaD9yGMtwVj3e7qMZNuSSxuQuhXKccrQj",
  publicKeyBase64: "Mvzw9tEbDl4wl36Z5Yhg83IQTMwyzB8AWgBkf2EMjKw=",
} as unknown as LocalSigner;

const IDENTITY = {
  username: "@openclawtest",
  cryptoId: SIGNER.agentId,
  status: "active",
  registeredAt: "2026-06-17T00:00:00.000Z",
  expiresAt: "2027-06-17T00:00:00.000Z",
};

test("buyDomain (re-exported from the flagship SDK) registers and summarizes", async () => {
  let registerCalls = 0;
  let profileWrites = 0;
  const client = {
    registry: {
      register: (): Promise<unknown> => {
        registerCalls += 1;
        return Promise.resolve(IDENTITY);
      },
    },
    // The flagship buyDomain no longer does best-effort harness-key telemetry,
    // so this must NOT be called (the harnessKey rides on every request instead).
    users: {
      updateProfile: (): Promise<never> => {
        profileWrites += 1;
        return Promise.reject(new Error("updateProfile should not be called"));
      },
    },
  } as unknown as TinyPlaceClient;

  const result = await buyDomain(client, SIGNER, "openclawtest");

  assert.equal(registerCalls, 1);
  assert.equal(profileWrites, 0);
  assert.equal(result.username, "@openclawtest");
  assert.equal(result.status, "active");
});
