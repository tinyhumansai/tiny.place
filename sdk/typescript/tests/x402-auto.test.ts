import { describe, expect, it } from "vitest";
import {
  challengeOf,
  payFromChallenge,
  withAutoPayment,
  type X402Signer,
} from "../src/agent/x402-auto.js";
import { LocalSigner } from "../src/index.js";
import { TinyPlaceError } from "../src/http.js";

const CHALLENGE = {
  scheme: "exact" as const,
  network: "solana:mainnet",
  asset: "USDC",
  amount: "1000000",
  to: "treasuryWallet",
};

function paymentRequired(): TinyPlaceError {
  return new TinyPlaceError(
    402,
    { error: "payment required", payment: CHALLENGE },
    "HTTP 402",
  );
}

async function signer(): Promise<X402Signer> {
  return LocalSigner.generate({ siws: false });
}

describe("challengeOf", () => {
  it("extracts the challenge from a 402 TinyPlaceError body", () => {
    expect(challengeOf(paymentRequired())?.amount).toBe("1000000");
  });

  it("returns undefined for non-402 errors", () => {
    expect(challengeOf(new TinyPlaceError(404, {}))).toBeUndefined();
    expect(challengeOf(new Error("nope"))).toBeUndefined();
  });
});

describe("payFromChallenge", () => {
  it("signs a payment map carrying the challenge terms and merged metadata", async () => {
    const map = await payFromChallenge(await signer(), CHALLENGE, {
      purpose: "registration",
    });
    expect(map["asset"]).toBe("USDC");
    expect(map["amount"]).toBe("1000000");
    expect(map["to"]).toBe("treasuryWallet");
    expect(map["metadata.purpose"]).toBe("registration");
    expect(map["signature"]).toBeTruthy();
  });

  it("rejects a challenge missing required fields", async () => {
    await expect(
      payFromChallenge(await signer(), { asset: "USDC" }),
    ).rejects.toThrow(/missing network\/asset\/amount\/to/);
  });
});

describe("withAutoPayment", () => {
  it("returns the first attempt when it succeeds without a 402", async () => {
    let calls = 0;
    const result = await withAutoPayment(await signer(), async () => {
      calls += 1;
      return "ok";
    });
    expect(result).toBe("ok");
    expect(calls).toBe(1);
  });

  it("settles the 402 and retries with a payment map", async () => {
    const attempts: Array<Record<string, string> | undefined> = [];
    const result = await withAutoPayment(
      await signer(),
      async (payment) => {
        attempts.push(payment);
        if (!payment) throw paymentRequired();
        return { settled: true, asset: payment["asset"] };
      },
      { metadata: { identity: "@demo" } },
    );
    expect(result).toEqual({ settled: true, asset: "USDC" });
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toBeUndefined();
    expect(attempts[1]?.["metadata.identity"]).toBe("@demo");
  });

  it("propagates a non-402 error without retrying", async () => {
    let calls = 0;
    await expect(
      withAutoPayment(await signer(), async () => {
        calls += 1;
        throw new TinyPlaceError(400, { error: "bad" });
      }),
    ).rejects.toBeInstanceOf(TinyPlaceError);
    expect(calls).toBe(1);
  });
});
