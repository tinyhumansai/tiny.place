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

  it("parses the challenge from the standard x402 v2 accepts[] array", () => {
    const error = new TinyPlaceError(402, {
      error: "payment required",
      x402Version: 2,
      resource: { url: "https://tiny.place" },
      accepts: [
        {
          scheme: "exact",
          network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
          amount: "1000000",
          asset: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
          payTo: "treasury-address",
          maxTimeoutSeconds: 60,
          extra: {
            domain: "tiny.place",
            feePayer: "facilitator-address",
            from: "payer-address",
            nonce: "nonce-xyz",
            expiresAt: "2026-06-21T00:00:00Z",
          },
        },
      ],
      extensions: {},
    });
    expect(error.code).toBe("payment_required");
    const payment = error.paymentRequired?.payment;
    expect(payment?.amount).toBe("1000000");
    expect(payment?.asset).toBe("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
    // payTo is mapped to `to`.
    expect(payment?.to).toBe("treasury-address");
    // Binding fields are promoted out of `extra` to the top level.
    expect(payment?.from).toBe("payer-address");
    expect(payment?.nonce).toBe("nonce-xyz");
    expect(payment?.expiresAt).toBe("2026-06-21T00:00:00Z");
    // The remaining extra becomes the signed metadata; binding keys are not
    // duplicated into it (they would corrupt the canonical signing message).
    expect(payment?.metadata?.["domain"]).toBe("tiny.place");
    expect(payment?.metadata?.["feePayer"]).toBe("facilitator-address");
    expect(payment?.metadata?.["nonce"]).toBeUndefined();
    expect(payment?.metadata?.["from"]).toBeUndefined();
  });

  it("falls back to the legacy payment field when accepts[] is absent", () => {
    const error = new TinyPlaceError(402, {
      error: "payment required",
      payment: { amount: "500", asset: "USDC", to: "treasury" },
    });
    expect(error.paymentRequired?.payment.amount).toBe("500");
    expect(error.paymentRequired?.payment.to).toBe("treasury");
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
