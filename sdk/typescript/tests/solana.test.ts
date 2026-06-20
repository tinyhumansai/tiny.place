import { describe, expect, it } from "vitest";

import {
  LocalSigner,
  SOLANA_MAINNET_NETWORK,
  SOLANA_USDC_MINT,
  executeSolanaPayment,
  executeSolanaX402Payment,
  resolveSolanaAsset,
  solanaAssetSymbol,
} from "../src/index.js";

describe("Solana payment execution", () => {
  function createMockFetch(
    calls: Array<{ method: string; params: Array<unknown> }>,
  ): typeof globalThis.fetch {
    return async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as {
        method: string;
        params: Array<unknown>;
      };
      calls.push({ method: body.method, params: body.params });
      switch (body.method) {
        case "getTokenAccountsByOwner":
          return Response.json({
            jsonrpc: "2.0",
            id: body.method,
            result: {
              value: [
                {
                  pubkey:
                    calls.length === 1
                      ? "89t6Va3uXRRzmPzfrt2VTPpGatBDFoj9gNeRVyeANKdK"
                      : "FYBkeQZniT9vpdGGFiT57gbXEYLTTbeqiVmMRLvK87rQ",
                  account: {
                    data: {
                      parsed: {
                        info: {
                          tokenAmount: { amount: "10" },
                        },
                      },
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
            result: {
              value: {
                blockhash: "11111111111111111111111111111111",
              },
            },
          });
        case "sendTransaction":
          expect(typeof body.params[0]).toBe("string");
          expect((body.params[1] as { encoding?: string }).encoding).toBe(
            "base64",
          );
          return Response.json({
            jsonrpc: "2.0",
            id: body.method,
            result:
              "5q22im1eoEeoJMhsshDkoh4tNV1WPUfyaJXHwyGqcpfmtpY1ZCC665nc5chyEwwau4JoR7BUnCbxWn5BW5WzR3NC",
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
  }

  async function createSigner(): Promise<{
    secretKey: Uint8Array;
    signer: LocalSigner;
  }> {
    const seed = new Uint8Array(32).fill(17);
    const signer = await LocalSigner.fromSeed(seed);
    const secretKey = new Uint8Array(64);
    secretKey.set(seed, 0);
    secretKey.set(signer.publicKey, 32);
    return { secretKey, signer };
  }

  it("submits and confirms a signed SPL transfer through JSON-RPC", async () => {
    const { secretKey, signer } = await createSigner();
    const calls: Array<{ method: string; params: Array<unknown> }> = [];
    const fetch = createMockFetch(calls);

    const result = await executeSolanaPayment({
      rpcUrl: "https://solana.example.test",
      secretKey,
      payment: {
        network: SOLANA_MAINNET_NETWORK,
        asset: "USDC",
        amount: "1",
        to: "F8zMkwbG3hp1k2t3eQWQh9bsh8qrK8CtqfZ2dBrrW3Ee",
      },
      fetch,
    });

    expect(result).toMatchObject({
      from: signer.agentId,
      to: "F8zMkwbG3hp1k2t3eQWQh9bsh8qrK8CtqfZ2dBrrW3Ee",
      amount: "1",
      sourceTokenAccount: "89t6Va3uXRRzmPzfrt2VTPpGatBDFoj9gNeRVyeANKdK",
      destinationTokenAccount: "FYBkeQZniT9vpdGGFiT57gbXEYLTTbeqiVmMRLvK87rQ",
      signature:
        "5q22im1eoEeoJMhsshDkoh4tNV1WPUfyaJXHwyGqcpfmtpY1ZCC665nc5chyEwwau4JoR7BUnCbxWn5BW5WzR3NC",
    });
    expect(calls.map((call) => call.method)).toEqual([
      "getTokenAccountsByOwner",
      "getTokenAccountsByOwner",
      "getLatestBlockhash",
      "sendTransaction",
      "getSignatureStatuses",
    ]);
  });

  it("settles an SPL transfer when the challenge advertises the mint address", async () => {
    // The x402 challenge now carries the SPL mint in `asset` (not the "USDC"
    // symbol). The mint must be echoed/used directly without an explicit mint.
    const { secretKey, signer } = await createSigner();
    const calls: Array<{ method: string; params: Array<unknown> }> = [];

    const result = await executeSolanaPayment({
      rpcUrl: "https://solana.example.test",
      secretKey,
      payment: {
        network: SOLANA_MAINNET_NETWORK,
        asset: SOLANA_USDC_MINT,
        amount: "1",
        to: "F8zMkwbG3hp1k2t3eQWQh9bsh8qrK8CtqfZ2dBrrW3Ee",
      },
      fetch: createMockFetch(calls),
    });

    expect(result.mint).toBe(SOLANA_USDC_MINT);
    expect(result.from).toBe(signer.agentId);
    // Followed the SPL path (token-account lookups), not native SOL.
    expect(calls.map((call) => call.method)).toEqual([
      "getTokenAccountsByOwner",
      "getTokenAccountsByOwner",
      "getLatestBlockhash",
      "sendTransaction",
      "getSignatureStatuses",
    ]);
  });

  it("rejects an unknown non-address asset with no mint", async () => {
    const { secretKey } = await createSigner();
    await expect(
      executeSolanaPayment({
        rpcUrl: "https://solana.example.test",
        secretKey,
        payment: {
          network: SOLANA_MAINNET_NETWORK,
          asset: "WAT",
          amount: "1",
          to: "F8zMkwbG3hp1k2t3eQWQh9bsh8qrK8CtqfZ2dBrrW3Ee",
        },
      }),
    ).rejects.toThrow("Unsupported Solana asset");
  });

  it("resolves assets by symbol and by mint address", () => {
    expect(resolveSolanaAsset("USDC")?.mint).toBe(SOLANA_USDC_MINT);
    expect(resolveSolanaAsset(SOLANA_USDC_MINT)?.symbol).toBe("USDC");
    expect(solanaAssetSymbol(SOLANA_USDC_MINT)).toBe("USDC");
    expect(solanaAssetSymbol("usdc")).toBe("USDC");
    // Native SOL has no SPL mint.
    expect(resolveSolanaAsset("SOL")?.native).toBe(true);
    // An unknown but base58-shaped value is treated as a bare mint.
    const bare = resolveSolanaAsset("So11111111111111111111111111111111111111112");
    expect(bare?.symbol).toBe("WSOL");
    // A short unknown symbol resolves to nothing.
    expect(resolveSolanaAsset("WAT")).toBeUndefined();
  });

  it("signs x402 metadata after the Solana transaction signature is known", async () => {
    const { secretKey, signer } = await createSigner();
    const calls: Array<{ method: string; params: Array<unknown> }> = [];

    const result = await executeSolanaX402Payment({
      rpcUrl: "https://solana.example.test",
      secretKey,
      signer,
      payment: {
        network: SOLANA_MAINNET_NETWORK,
        asset: "USDC",
        amount: "1",
        to: "F8zMkwbG3hp1k2t3eQWQh9bsh8qrK8CtqfZ2dBrrW3Ee",
        metadata: {
          identity: "@agent",
          purpose: "registration",
        },
      },
      fetch: createMockFetch(calls),
    });

    expect(result.payment).toMatchObject({
      amount: "1",
      from: signer.agentId,
      "metadata.identity": "@agent",
      "metadata.onChainTx": result.signature,
      "metadata.purpose": "registration",
      "metadata.transaction": result.signature,
      "metadata.tx": result.signature,
      onChainTx: result.signature,
      transaction: result.signature,
      tx: result.signature,
    });
    expect(result.payment.signature).toBeTruthy();
  });

  it("submits a native SOL transfer without any token-account lookups", async () => {
    const { secretKey, signer } = await createSigner();
    const calls: Array<{ method: string; params: Array<unknown> }> = [];

    const result = await executeSolanaPayment({
      rpcUrl: "https://solana.example.test",
      secretKey,
      payment: {
        network: SOLANA_MAINNET_NETWORK,
        asset: "SOL",
        amount: "1000000000", // 1 SOL in lamports
        to: "F8zMkwbG3hp1k2t3eQWQh9bsh8qrK8CtqfZ2dBrrW3Ee",
      },
      fetch: createMockFetch(calls),
    });

    // Native SOL pays wallet -> wallet with no SPL mint or token accounts.
    expect(result).toMatchObject({
      from: signer.agentId,
      to: "F8zMkwbG3hp1k2t3eQWQh9bsh8qrK8CtqfZ2dBrrW3Ee",
      mint: "SOL",
      amount: "1000000000",
      sourceTokenAccount: signer.agentId,
      destinationTokenAccount: "F8zMkwbG3hp1k2t3eQWQh9bsh8qrK8CtqfZ2dBrrW3Ee",
    });
    // No getTokenAccountsByOwner — that is the SPL-only path.
    expect(calls.map((call) => call.method)).toEqual([
      "getLatestBlockhash",
      "sendTransaction",
      "getSignatureStatuses",
    ]);
  });

  it("accepts any solana:* network when none is pinned (e.g. a local validator)", async () => {
    const { secretKey } = await createSigner();
    const calls: Array<{ method: string; params: Array<unknown> }> = [];

    const result = await executeSolanaPayment({
      rpcUrl: "http://localhost:8899",
      secretKey,
      payment: {
        // A non-mainnet solana network label must still be accepted.
        network: "solana:LOCALNET1111111111111111111111111111111",
        asset: "SOL",
        amount: "500",
        to: "F8zMkwbG3hp1k2t3eQWQh9bsh8qrK8CtqfZ2dBrrW3Ee",
      },
      fetch: createMockFetch(calls),
    });
    expect(result.signature).toBeTruthy();
  });

  it("rejects a non-solana network", async () => {
    await expect(
      executeSolanaPayment({
        rpcUrl: "https://solana.example.test",
        secretKey: new Uint8Array(32),
        payment: {
          network: "eip155:8453",
          asset: "USDC",
          amount: "1",
          to: "recipient",
        },
      }),
    ).rejects.toThrow("Unsupported Solana network");
  });

  it("enforces an explicitly pinned network", async () => {
    const { secretKey } = await createSigner();
    await expect(
      executeSolanaPayment({
        rpcUrl: "https://solana.example.test",
        secretKey,
        network: SOLANA_MAINNET_NETWORK,
        payment: {
          network: "solana:LOCALNET1111111111111111111111111111111",
          asset: "SOL",
          amount: "1",
          to: "F8zMkwbG3hp1k2t3eQWQh9bsh8qrK8CtqfZ2dBrrW3Ee",
        },
      }),
    ).rejects.toThrow("Unexpected Solana network");
  });
});
