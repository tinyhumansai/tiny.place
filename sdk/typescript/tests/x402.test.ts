import { describe, expect, it } from "vitest";
import {
  buildCanonicalMessage,
  x402AuthorizationToPaymentMap,
  type X402Authorization,
} from "../src/index.js";

describe("x402 helpers", () => {
  it("flattens signed authorizations into backend payment maps", () => {
    const authorization: X402Authorization = {
      scheme: "exact",
      network: "eip155:8453",
      asset: "USDC",
      amount: "5",
      from: "tiny1payer",
      to: "tinyplace-registry",
      nonce: "reg_nonce",
      expiresAt: "2026-06-13T00:00:00Z",
      signature: "signature",
      metadata: {
        domain: "tiny.place",
        identity: "@agent",
        publicKey: "public-key",
        purpose: "registration",
      },
    };

    expect(x402AuthorizationToPaymentMap(authorization)).toEqual({
      scheme: "exact",
      network: "eip155:8453",
      asset: "USDC",
      amount: "5",
      from: "tiny1payer",
      to: "tinyplace-registry",
      nonce: "reg_nonce",
      expiresAt: "2026-06-13T00:00:00Z",
      signature: "signature",
      "metadata.domain": "tiny.place",
      "metadata.identity": "@agent",
      "metadata.publicKey": "public-key",
      "metadata.purpose": "registration",
    });
  });

  it("keeps metadata sorted in canonical signing messages", () => {
    expect(
      buildCanonicalMessage({
        scheme: "exact",
        network: "eip155:8453",
        asset: "USDC",
        amount: "5",
        from: "tiny1payer",
        to: "tinyplace-registry",
        nonce: "reg_nonce",
        expiresAt: "2026-06-13T00:00:00Z",
        metadata: {
          purpose: "registration",
          domain: "tiny.place",
        },
      }),
    ).toContain(
      '"metadata":[{"key":"domain","value":"tiny.place"},{"key":"purpose","value":"registration"}]',
    );
  });
});
