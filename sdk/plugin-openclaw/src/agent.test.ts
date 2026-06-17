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

/** Runs `fn` with process.stderr.write captured; returns what was written. */
async function captureStderr(fn: () => Promise<void>): Promise<string> {
  const original = process.stderr.write.bind(process.stderr);
  let captured = "";
  process.stderr.write = ((chunk: string | Uint8Array): boolean => {
    captured += typeof chunk === "string" ? chunk : chunk.toString();
    return true;
  }) as typeof process.stderr.write;
  try {
    await fn();
  } finally {
    process.stderr.write = original;
  }
  return captured;
}

test("buyDomain returns the registration result even when recordHarness fails", async () => {
  let registerCalls = 0;
  const client = {
    registry: {
      register: (): Promise<unknown> => {
        registerCalls += 1;
        return Promise.resolve(IDENTITY);
      },
    },
    users: {
      // The profile-write the harness telemetry uses; reject it as staging does.
      updateProfile: (): Promise<never> =>
        Promise.reject(new Error("HTTP 401: invalid signature")),
    },
  } as unknown as TinyPlaceClient;

  let result: Awaited<ReturnType<typeof buyDomain>> | undefined;
  const warnings = await captureStderr(async (): Promise<void> => {
    result = await buyDomain(client, SIGNER, "openclawtest");
  });

  // The successful registration must survive a failed harness write.
  assert.equal(registerCalls, 1);
  assert.equal(result?.username, "@openclawtest");
  assert.equal(result?.status, "active");
  // ...and the failure is surfaced as a non-fatal warning, not thrown.
  assert.match(warnings, /could not record harness key/);
  assert.match(warnings, /invalid signature/);
});

test("buyDomain succeeds silently when recordHarness succeeds", async () => {
  const client = {
    registry: { register: (): Promise<unknown> => Promise.resolve(IDENTITY) },
    users: { updateProfile: (): Promise<unknown> => Promise.resolve({}) },
  } as unknown as TinyPlaceClient;

  const warnings = await captureStderr(async (): Promise<void> => {
    const result = await buyDomain(client, SIGNER, "openclawtest");
    assert.equal(result.username, "@openclawtest");
  });
  assert.equal(warnings, "");
});
