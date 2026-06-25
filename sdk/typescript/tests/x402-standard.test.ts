import { describe, expect, it } from "vitest";

import { SOLANA_USDC_MINT, deriveAssociatedTokenAddress } from "../src/solana.js";
import {
  X402_VERSION,
  buildExactSvmPaymentPayload,
  decodePaymentRequired,
  decodeSettlementResponse,
  encodePaymentSignature,
  encodeX402Header,
  selectExactSvmRequirement,
  type X402PaymentRequired,
} from "../src/x402-standard.js";

const FEE_PAYER = "EwWqGE4ZFKLofuestmU4LDdK7XM1N4ALgdZccwYugwGd";
const PAY_TO = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const NETWORK = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";

function challenge(): X402PaymentRequired {
  return {
    x402Version: 2,
    error: "payment required",
    resource: { url: "/registry/names", mimeType: "application/json" },
    accepts: [
      {
        scheme: "exact",
        network: NETWORK,
        amount: "1000000",
        asset: SOLANA_USDC_MINT,
        payTo: PAY_TO,
        maxTimeoutSeconds: 60,
        extra: { feePayer: FEE_PAYER, memo: "pi_abc" },
      },
    ],
  };
}

function blockhashFetch(): typeof globalThis.fetch {
  return (async () =>
    new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: "getLatestBlockhash",
        result: { value: { blockhash: "11111111111111111111111111111111" } },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )) as unknown as typeof globalThis.fetch;
}

describe("x402 standard header codec", () => {
  it("round-trips the PAYMENT-REQUIRED challenge through base64", () => {
    const header = encodeX402Header(challenge());
    const decoded = decodePaymentRequired(header);
    expect(decoded?.x402Version).toBe(2);
    expect(decoded?.accepts[0]?.payTo).toBe(PAY_TO);
    expect(decoded?.accepts[0]?.extra?.["feePayer"]).toBe(FEE_PAYER);
  });

  it("decodes a PAYMENT-RESPONSE settlement header", () => {
    const header = encodeX402Header({
      success: true,
      transaction: "5xSig",
      network: NETWORK,
      payer: PAY_TO,
    });
    const settled = decodeSettlementResponse(header);
    expect(settled?.success).toBe(true);
    expect(settled?.transaction).toBe("5xSig");
  });

  it("returns undefined for malformed headers", () => {
    expect(decodePaymentRequired("@@not-base64@@")).toBeUndefined();
    expect(decodePaymentRequired(null)).toBeUndefined();
    expect(decodeSettlementResponse(undefined)).toBeUndefined();
  });

  it("selects the Solana exact requirement", () => {
    const requirement = selectExactSvmRequirement(challenge());
    expect(requirement?.asset).toBe(SOLANA_USDC_MINT);
  });
});

describe("buildExactSvmPaymentPayload", () => {
  it("wraps a partially-signed transfer in the v2 envelope", async () => {
    const payload = await buildExactSvmPaymentPayload({
      challenge: challenge(),
      secretKey: new Uint8Array(32).fill(7),
      rpcUrl: "https://rpc.test.invalid",
      fetch: blockhashFetch(),
    });

    expect(payload.x402Version).toBe(X402_VERSION);
    expect(payload.accepted.asset).toBe(SOLANA_USDC_MINT);
    expect(payload.accepted.payTo).toBe(PAY_TO);
    expect(typeof payload.payload["transaction"]).toBe("string");

    // The PAYMENT-SIGNATURE header is the base64 of this exact envelope.
    const header = encodePaymentSignature(payload);
    const redecoded = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(atob(header), (c) => c.charCodeAt(0)),
      ),
    );
    expect(redecoded.accepted.asset).toBe(SOLANA_USDC_MINT);
    expect(redecoded.payload.transaction).toBe(payload.payload["transaction"]);

    // Sanity: the embedded tx targets the ATA the facilitator will verify.
    expect(deriveAssociatedTokenAddress(PAY_TO, SOLANA_USDC_MINT)).toBe(
      "FGETo8T8wMcN2wCjav8VK6eh3dLk63evNDPxzLSJra8B",
    );
  });

  it("rejects a challenge with no Solana exact method", async () => {
    await expect(
      buildExactSvmPaymentPayload({
        challenge: { x402Version: 2, accepts: [] },
        secretKey: new Uint8Array(32).fill(7),
        rpcUrl: "https://rpc.test.invalid",
        fetch: blockhashFetch(),
      }),
    ).rejects.toThrow(/no Solana exact-scheme/i);
  });
});
