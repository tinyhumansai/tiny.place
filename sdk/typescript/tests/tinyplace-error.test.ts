import { describe, expect, it } from "vitest";
import { TinyPlaceError } from "../src/http.js";

/**
 * TinyPlaceError self-classifies: `code`/`hint`/`retryable` getters and a
 * `toJSON()` give an agent the recovery context directly off the thrown error,
 * without importing the classifier. These are additive — the constructor and the
 * existing `status`/`body`/`headers`/`paymentRequired` fields are unchanged.
 */
describe("TinyPlaceError self-classification", () => {
  it("exposes code/hint/retryable for a 429", () => {
    const error = new TinyPlaceError(429, { error: "slow down" });
    expect(error.code).toBe("rate_limited");
    expect(error.retryable).toBe(true);
    expect(error.hint).toMatch(/retry/i);
  });

  it("classifies a 402 with a challenge as payment_required", () => {
    const error = new TinyPlaceError(402, {
      payment: { amount: "1000", asset: "USDC" },
    });
    expect(error.code).toBe("payment_required");
    expect(error.retryable).toBe(false);
    // The parsed challenge is still surfaced the old way too.
    expect(error.paymentRequired?.payment.amount).toBe("1000");
  });

  it("parses a STANDARD x402 v2 accepts[] 402 challenge", () => {
    // The shape backend-v2 emits: top-level x402Version/error/resource plus a
    // single `exact`-scheme accepts[] entry (payTo/amount, optional extra.feePayer).
    const error = new TinyPlaceError(402, {
      x402Version: 2,
      error: "payment required",
      resource: { url: "/registry/names/@alice", mimeType: "application/json" },
      accepts: [
        {
          scheme: "exact",
          network: "solana",
          asset: "USDC",
          amount: "1000000",
          payTo: "TREASURYxyz",
          maxTimeoutSeconds: 60,
          extra: { feePayer: "FEEPAYERabc" },
        },
      ],
    });
    expect(error.code).toBe("payment_required");
    const challenge = error.paymentRequired;
    expect(challenge?.x402Version).toBe(2);
    expect(challenge?.resource).toBe("/registry/names/@alice");
    expect(challenge?.payment.scheme).toBe("exact");
    expect(challenge?.payment.network).toBe("solana");
    expect(challenge?.payment.asset).toBe("USDC");
    expect(challenge?.payment.amount).toBe("1000000");
    // payTo maps onto the SDK's `to`; the standard challenge has no payer.
    expect(challenge?.payment.to).toBe("TREASURYxyz");
    expect(challenge?.payment.from).toBeUndefined();
    expect(challenge?.payment.maxTimeoutSeconds).toBe(60);
    // extra.feePayer is surfaced on the challenge and mirrored into metadata.
    expect(challenge?.payment.feePayer).toBe("FEEPAYERabc");
    expect(challenge?.payment.metadata?.feePayer).toBe("FEEPAYERabc");
  });

  it("reads amount from maxAmountRequired in an accepts[] entry", () => {
    const error = new TinyPlaceError(402, {
      x402Version: 2,
      accepts: [
        {
          scheme: "exact",
          network: "solana",
          asset: "USDC",
          maxAmountRequired: "2500000",
          payTo: "TREASURYxyz",
        },
      ],
    });
    expect(error.paymentRequired?.payment.amount).toBe("2500000");
  });

  it("serializes via toJSON with the recovery fields", () => {
    const error = new TinyPlaceError(404, { error: "missing" });
    const json = error.toJSON();
    expect(json).toMatchObject({
      name: "TinyPlaceError",
      status: 404,
      code: "not_found",
      retryable: false,
      body: { error: "missing" },
    });
    expect(json.hint.length).toBeGreaterThan(0);
    // JSON.stringify now yields the structured object instead of "{}".
    expect(JSON.parse(JSON.stringify(error)).code).toBe("not_found");
  });

  it("does not duplicate paymentRequired in toJSON when absent", () => {
    const json = new TinyPlaceError(500, "boom").toJSON();
    expect(json.code).toBe("server");
    expect("paymentRequired" in json).toBe(false);
  });

  it("keeps the existing status/body/headers contract intact", () => {
    const error = new TinyPlaceError(403, { error: "nope" }, "Forbidden", {
      headers: { "x-trace": "abc" },
    });
    expect(error).toBeInstanceOf(Error);
    expect(error.status).toBe(403);
    expect(error.message).toBe("Forbidden");
    expect(error.headers["x-trace"]).toBe("abc");
  });
});
