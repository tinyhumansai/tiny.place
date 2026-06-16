import { describe, expect, it } from "vitest";
import {
  LocalSigner,
  SOLANA_NATIVE_ASSET,
  SOLANA_MAINNET_NETWORK,
  TinyPlaceError,
  TinyPlaceClient,
  type SolanaSettlementFailure,
} from "../src/index.js";

describe("PaymentsApi", () => {
  const payment = {
    scheme: "upto" as const,
    network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
    asset: "USDC",
    amount: "1000000",
    from: "61KcG5aGLqpnJz2fn4tujFKAdzqsdGR9XqiUeVoT3vPg",
    to: "F8zMkwbG3hp1k2t3eQWQh9bsh8qrK8CtqfZ2dBrrW3Ee",
    nonce: "nonce",
    expiresAt: "2026-06-13T00:00:00Z",
    signature: "signature",
  };

  it("passes settledAmount through settle requests", async () => {
    let request: Request | undefined;
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      fetch: async (input, init) => {
        request = new Request(input, init);
        return Response.json({ settled: true });
      },
    });

    await client.payments.settle({
      payment,
      settledAmount: "250000",
      feeQuoteId: "fee_123",
      reference: { kind: "test" },
      shielded: true,
    });

    expect(request).toBeDefined();
    expect(request!.method).toBe("POST");
    expect(request!.url).toBe("https://example.test/payments/settle");
    await expect(request!.json()).resolves.toEqual({
      payment,
      settledAmount: "250000",
      feeQuoteId: "fee_123",
      reference: { kind: "test" },
      shielded: true,
    });
  });

  it("retries verification while Solana transactions are still settling", async () => {
    const responses = [
      { valid: false, error: "transaction not found" },
      { valid: false, error: "insufficient confirmations" },
      {
        valid: true,
        verifiedId:
          "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:transaction-signature",
      },
    ];
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(responses.shift());
      },
    });

    const response = await client.payments.verifyUntilValid(payment, {
      intervalMs: 0,
    });

    expect(response).toEqual({
      valid: true,
      verifiedId:
        "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:transaction-signature",
    });
    expect(requests).toHaveLength(3);
    await expect(requests[0]!.json()).resolves.toEqual({ payment });
  });

  it("does not retry non-confirmation verification failures", async () => {
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({ valid: false, error: "signature mismatch" });
      },
    });

    const response = await client.payments.verifyUntilValid(payment, {
      intervalMs: 0,
    });

    expect(response).toEqual({ valid: false, error: "signature mismatch" });
    expect(requests).toHaveLength(1);
  });

  it("executes Solana payment and submits the resulting x402 map to settle", async () => {
    const seed = new Uint8Array(32).fill(45);
    const signer = await LocalSigner.fromSeed(seed);
    const secretKey = new Uint8Array(64);
    secretKey.set(seed, 0);
    secretKey.set(signer.publicKey, 32);
    const transaction =
      "4kzz3UspQhoBeWr4DNPP3Nc3Npg6W3ErQdd8wRDvCz6exryUCvNqfvV8JhpoTFCuN8pQ9DiwnQmg1K4ppok33RCK";
    const requests: Array<Request> = [];
    const rpcCalls: Array<string> = [];
    const fetch: typeof globalThis.fetch = async (input, init) => {
      const request = new Request(input, init);
      if (request.url === "https://example.test/payments/settle") {
        requests.push(request);
        return Response.json({
          settled: true,
          ledgerTxId: "ledger_123",
          onChainTx: transaction,
        });
      }

      const body = JSON.parse(String(init?.body)) as {
        method: string;
        params: Array<unknown>;
      };
      rpcCalls.push(body.method);
      switch (body.method) {
        case "getTokenAccountsByOwner":
          return Response.json({
            jsonrpc: "2.0",
            id: body.method,
            result: {
              value: [
                {
                  pubkey:
                    rpcCalls.length === 1
                      ? "89t6Va3uXRRzmPzfrt2VTPpGatBDFoj9gNeRVyeANKdK"
                      : "FYBkeQZniT9vpdGGFiT57gbXEYLTTbeqiVmMRLvK87rQ",
                  account: {
                    data: {
                      parsed: { info: { tokenAmount: { amount: "10" } } },
                    },
                  },
                },
              ],
            },
          });
        case "getLatestBlockhash":
          return Response.json({
            jsonrpc: "2.0",
            id: body.method,
            result: { value: { blockhash: "11111111111111111111111111111111" } },
          });
        case "sendTransaction":
          return Response.json({
            jsonrpc: "2.0",
            id: body.method,
            result: transaction,
          });
        case "getSignatureStatuses":
          return Response.json({
            jsonrpc: "2.0",
            id: body.method,
            result: {
              value: [{ confirmationStatus: "confirmed", err: null }],
            },
          });
        default:
          return Response.json(
            {
              jsonrpc: "2.0",
              id: body.method,
              error: { message: `unexpected method ${body.method}` },
            },
            { status: 500 },
          );
      }
    };
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      signer,
      fetch,
    });

    const result = await client.payments.settleWithSolanaPayment({
      rpcUrl: "https://solana.example.test",
      secretKey,
      fetch,
      network: SOLANA_MAINNET_NETWORK,
      asset: "USDC",
      amount: "1",
      from: signer.agentId,
      to: "F8zMkwbG3hp1k2t3eQWQh9bsh8qrK8CtqfZ2dBrrW3Ee",
      nonce: "settle-nonce",
      expiresAt: "2026-06-13T10:00:00Z",
      reference: { kind: "sdk-test" },
      shielded: true,
    });

    expect(result.execution.signature).toBe(transaction);
    expect(result.settlement.ledgerTxId).toBe("ledger_123");
    expect(requests).toHaveLength(1);
    const body = (await requests[0]!.json()) as {
      payment: Record<string, string>;
      reference: Record<string, string>;
      shielded: boolean;
    };
    expect(body.payment).toMatchObject({
      amount: "1",
      asset: "USDC",
      from: signer.agentId,
      network: SOLANA_MAINNET_NETWORK,
      to: "F8zMkwbG3hp1k2t3eQWQh9bsh8qrK8CtqfZ2dBrrW3Ee",
      nonce: "settle-nonce",
      metadata: {
        domain: "tiny.place",
        publicKey: signer.publicKeyBase64,
        onChainTx: transaction,
        transaction,
        tx: transaction,
      },
    });
    expect(body.reference).toEqual({ kind: "sdk-test" });
    expect(body.shielded).toBe(true);
    expect(rpcCalls).toEqual([
      "getTokenAccountsByOwner",
      "getTokenAccountsByOwner",
      "getLatestBlockhash",
      "sendTransaction",
      "getSignatureStatuses",
    ]);
  });

  it("preserves retry and refund recovery state when settlement fails after Solana execution", async () => {
    const seed = new Uint8Array(32).fill(49);
    const signer = await LocalSigner.fromSeed(seed);
    const secretKey = new Uint8Array(64);
    secretKey.set(seed, 0);
    secretKey.set(signer.publicKey, 32);
    const transaction =
      "3WcpF4Mp6LXjYQjKX9N1yGrYtAg1N1wPiLPZidFqBtb4ppE9TFkHrGSybvcFJwzo66rucssBmB7yVbK6FFMX2ErW";
    const settleRequests: Array<Request> = [];
    const fetch: typeof globalThis.fetch = async (input, init) => {
      const request = new Request(input, init);
      if (request.url === "https://example.test/payments/settle") {
        settleRequests.push(request);
        return Response.json(
          { error: "executor failed after payment settlement" },
          { status: 500 },
        );
      }

      const body = JSON.parse(String(init?.body)) as {
        method: string;
        params: Array<unknown>;
      };
      switch (body.method) {
        case "getLatestBlockhash":
          return Response.json({
            jsonrpc: "2.0",
            id: body.method,
            result: { value: { blockhash: "11111111111111111111111111111111" } },
          });
        case "sendTransaction":
          return Response.json({
            jsonrpc: "2.0",
            id: body.method,
            result: transaction,
          });
        case "getSignatureStatuses":
          return Response.json({
            jsonrpc: "2.0",
            id: body.method,
            result: {
              value: [{ confirmationStatus: "confirmed", err: null }],
            },
          });
        default:
          return Response.json(
            {
              jsonrpc: "2.0",
              id: body.method,
              error: { message: `unexpected method ${body.method}` },
            },
            { status: 500 },
          );
      }
    };
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      signer,
      fetch,
    });

    try {
      await client.payments.settleWithSolanaPayment({
        rpcUrl: "https://solana.example.test",
        secretKey,
        fetch,
        network: SOLANA_MAINNET_NETWORK,
        asset: SOLANA_NATIVE_ASSET,
        amount: "1",
        from: signer.agentId,
        to: "F8zMkwbG3hp1k2t3eQWQh9bsh8qrK8CtqfZ2dBrrW3Ee",
        nonce: "settle-failure-nonce",
        expiresAt: "2026-06-13T10:00:00Z",
        reference: { kind: "swap", operationId: "swap_123" },
        shielded: true,
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(TinyPlaceError);
      const failure = error as TinyPlaceError & SolanaSettlementFailure;
      expect(failure.status).toBe(500);
      expect(failure.onChainTx).toBe(transaction);
      expect(failure.execution?.signature).toBe(transaction);
      expect(failure.settlementRecovery).toMatchObject({
        state: "settlement_failed_after_execution",
        action: "retry_settlement_or_refund",
        onChainTx: transaction,
        retryable: true,
        refundRequired: true,
        settlementRequest: {
          reference: { kind: "swap", operationId: "swap_123" },
          shielded: true,
        },
      });
      expect(failure.settlementRecovery?.payment).toMatchObject({
        amount: "1",
        asset: SOLANA_NATIVE_ASSET,
        from: signer.agentId,
        network: SOLANA_MAINNET_NETWORK,
        to: "F8zMkwbG3hp1k2t3eQWQh9bsh8qrK8CtqfZ2dBrrW3Ee",
        nonce: "settle-failure-nonce",
        metadata: {
          domain: "tiny.place",
          onChainTx: transaction,
          publicKey: signer.publicKeyBase64,
          transaction,
          tx: transaction,
        },
      });
    }

    expect(settleRequests).toHaveLength(1);
    await expect(settleRequests[0]!.json()).resolves.toMatchObject({
      reference: { kind: "swap", operationId: "swap_123" },
      shielded: true,
    });
  });

  it("signs operator payment maintenance routes with admin authorization", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(46));
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      adminSigningKey: signer,
      admin: { actor: "operator", role: "operator" },
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        if (new Request(input, init).url.includes("/renew-due")) {
          return Response.json({ renewed: 1, failed: 0, suspended: 0 });
        }
        return Response.json({
          flush: {
            flushId: "flush_123",
            batchId: "batch_123",
            status: "flushed",
            itemCount: 1,
            totalAmount: "100",
            parentLedgerTxId: "ledger_123",
          },
          ledgerTx: {
            txId: "ledger_123",
            visibility: "unshielded",
            type: "PAYMENT",
            network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
            timestamp: "2026-06-13T00:00:00.000Z",
            onChainTx: "tx_123",
            status: "SETTLED",
          },
        });
      },
    });

    await client.payments.renewDueSubscriptions({ limit: 5 });
    await client.payments.flushBatch("batch_123", { limit: 10 });

    expect(requests.map((request) => request.url)).toEqual([
      "https://example.test/payments/subscriptions/renew-due",
      "https://example.test/payments/batches/batch_123/flush",
    ]);
    for (const request of requests) {
      expect(request.method).toBe("POST");
      expect(request.headers.get("Authorization")).toMatch(
        /^TinyPlace-Admin actor="operator",role="operator",signature="[^"]+"$/,
      );
      expect(request.headers.get("X-TinyPlace-Date")).toBeTruthy();
      expect(request.headers.get("X-TinyPlace-Nonce")).toBeTruthy();
      expect(request.headers.get("X-Agent-ID")).toBeNull();
    }
    await expect(requests[0]!.json()).resolves.toEqual({ limit: 5 });
    await expect(requests[1]!.json()).resolves.toEqual({ limit: 10 });
  });

  it("uses directory auth for subscription reads and cancellation", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(47));
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        if (request.method === "DELETE") {
          return new Response(null, { status: 204 });
        }
        return Response.json({
          subscriptionId: "sub_123",
          subscriber: signer.agentId,
          provider: "provider",
          plan: { amount: "1", asset: "USDC", interval: "month" },
          authorization: payment,
          status: "active",
          currentPeriodEnd: "2026-07-13T00:00:00.000Z",
          createdAt: "2026-06-13T00:00:00.000Z",
          updatedAt: "2026-06-13T00:00:00.000Z",
        });
      },
    });

    await client.payments.getSubscription("sub_123", signer.agentId);
    await client.payments.cancelSubscription("sub_123", signer.agentId);

    expect(requests.map((request) => request.url)).toEqual([
      "https://example.test/payments/subscriptions/sub_123",
      "https://example.test/payments/subscriptions/sub_123",
    ]);
    expect(requests.map((request) => request.method)).toEqual([
      "GET",
      "DELETE",
    ]);
    for (const request of requests) {
      expect(request.headers.get("X-Agent-ID")).toBe(signer.agentId);
      expect(request.headers.get("X-TinyPlace-Public-Key")).toBe(
        signer.publicKeyBase64,
      );
      expect(request.headers.get("X-TinyPlace-Signature")).toBeTruthy();
      expect(request.headers.get("Authorization")).toBeNull();
    }
  });
});
