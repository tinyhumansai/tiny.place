import { describe, expect, it } from "vitest";
import {
  canonicalPayload,
  LocalSigner,
  SOLANA_MAINNET_NETWORK,
  TinyPlaceClient,
  TinyPlaceError,
} from "../src/index.js";

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function fromBase64Url(value: string): string {
  const padded = value.padEnd(
    value.length + ((4 - (value.length % 4)) % 4),
    "=",
  );
  return atob(padded.replaceAll("-", "+").replaceAll("_", "/"));
}

function toBase64Url(value: string): string {
  return btoa(value).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function verifyFreshSignature(
  signer: LocalSigner,
  signature: string,
  payload: string,
): Promise<boolean> {
  const [version, timestamp, nonce, rawSignature] = signature.split(":");
  expect(version).toBe("v1");
  expect(timestamp).toBeTruthy();
  expect(nonce).toBeTruthy();
  expect(rawSignature).toBeTruthy();

  const publicKey = await globalThis.crypto.subtle.importKey(
    "raw",
    signer.publicKey,
    { name: "Ed25519" },
    false,
    ["verify"],
  );
  return globalThis.crypto.subtle.verify(
    "Ed25519",
    publicKey,
    fromBase64(rawSignature!),
    new TextEncoder().encode(
      `${payload}\n${fromBase64Url(timestamp!)}\n${fromBase64Url(nonce!)}`,
    ),
  );
}

describe("RegistryApi", () => {
  it("signs registration over cryptoId, publicKey, username and null payment methods", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(19));
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({
          username: "@agent",
          cryptoId: signer.agentId,
          publicKey: signer.publicKeyBase64,
          registeredAt: "2026-06-13T00:00:00Z",
          expiresAt: "2027-06-13T00:00:00Z",
          status: "active",
          updatedAt: "2026-06-13T00:00:00Z",
        });
      },
    });

    await client.registry.register({
      username: "@agent",
      cryptoId: signer.agentId,
      publicKey: signer.publicKeyBase64,
    });

    expect(requests).toHaveLength(1);
    const body = (await requests[0]!.json()) as {
      cryptoId: string;
      publicKey: string;
      signature: string;
      username: string;
    };
    expect(body.signature).toBeTruthy();

    // A handle is just a pointer now: registration signs only the binding
    // fields. Bio/name/metadata live on the wallet's User and are not signed
    // here.
    const ok = await verifyFreshSignature(
      signer,
      body.signature,
      canonicalPayload("identity.register", {
        cryptoId: signer.agentId,
        paymentMethods: null,
        publicKey: signer.publicKeyBase64,
        username: "@agent",
      }),
    );
    expect(ok).toBe(true);
  });

  it("forwards actorType and primary unsigned and omits them from the signature", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(21));
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({
          username: "@agent",
          cryptoId: signer.agentId,
          publicKey: signer.publicKeyBase64,
          registeredAt: "2026-06-13T00:00:00Z",
          expiresAt: "2027-06-13T00:00:00Z",
          status: "active",
          primary: true,
          updatedAt: "2026-06-13T00:00:00Z",
        });
      },
    });

    await client.registry.register({
      username: "@agent",
      cryptoId: signer.agentId,
      publicKey: signer.publicKeyBase64,
      actorType: "human",
      primary: true,
    });

    const body = (await requests[0]!.json()) as {
      actorType?: string;
      primary?: boolean;
      signature: string;
    };
    // actorType and primary are forwarded in the body for the backend to act on,
    // but neither is part of the signed payload (both are trust-based).
    expect(body.primary).toBe(true);
    expect(body.actorType).toBe("human");

    const ok = await verifyFreshSignature(
      signer,
      body.signature,
      canonicalPayload("identity.register", {
        cryptoId: signer.agentId,
        paymentMethods: null,
        publicKey: signer.publicKeyBase64,
        username: "@agent",
      }),
    );
    expect(ok).toBe(true);
  });

  it("signs assign and unassign primary requests", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(22));
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({
          username: "@agent",
          bio: "",
          cryptoId: signer.agentId,
          publicKey: signer.publicKeyBase64,
          registeredAt: "2026-06-13T00:00:00Z",
          expiresAt: "2027-06-13T00:00:00Z",
          status: "active",
          primary: true,
          updatedAt: "2026-06-13T00:00:00Z",
        });
      },
    });

    await client.registry.assignPrimary("@agent");
    await client.registry.unassignPrimary("@agent");

    expect(requests).toHaveLength(2);
    expect(requests[0]!.url).toBe(
      "https://example.test/registry/names/%40agent/assign",
    );
    expect(requests[1]!.url).toBe(
      "https://example.test/registry/names/%40agent/unassign",
    );

    const assignBody = (await requests[0]!.json()) as { signature: string };
    expect(
      await verifyFreshSignature(
        signer,
        assignBody.signature,
        canonicalPayload("identity.assign", { username: "@agent" }),
      ),
    ).toBe(true);

    const unassignBody = (await requests[1]!.json()) as { signature: string };
    expect(
      await verifyFreshSignature(
        signer,
        unassignBody.signature,
        canonicalPayload("identity.unassign", { username: "@agent" }),
      ),
    ).toBe(true);
  });

  it("normalizes bare registration names before signing", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(20));
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({
          username: "@agent",
          bio: "Agent",
          cryptoId: signer.agentId,
          publicKey: signer.publicKeyBase64,
          registeredAt: "2026-06-13T00:00:00Z",
          expiresAt: "2027-06-13T00:00:00Z",
          status: "active",
          updatedAt: "2026-06-13T00:00:00Z",
        });
      },
    });

    await client.registry.register({
      username: "agent",
      cryptoId: signer.agentId,
      publicKey: signer.publicKeyBase64,
    });

    const body = (await requests[0]!.json()) as {
      signature: string;
      username: string;
    };
    expect(body.username).toBe("@agent");

    const ok = await verifyFreshSignature(
      signer,
      body.signature,
      canonicalPayload("identity.register", {
        cryptoId: signer.agentId,
        paymentMethods: null,
        publicKey: signer.publicKeyBase64,
        username: "@agent",
      }),
    );
    expect(ok).toBe(true);
  });

  it("executes and retries paid Solana registrations", async () => {
    const seed = new Uint8Array(32).fill(22);
    const signer = await LocalSigner.fromSeed(seed);
    const secretKey = new Uint8Array(64);
    secretKey.set(seed, 0);
    secretKey.set(signer.publicKey, 32);
    const rpcMethods: Array<string> = [];
    const registryRequests: Array<Request> = [];
    const transaction =
      "5q22im1eoEeoJMhsshDkoh4tNV1WPUfyaJXHwyGqcpfmtpY1ZCC665nc5chyEwwau4JoR7BUnCbxWn5BW5WzR3NC";
    const fetch: typeof globalThis.fetch = async (input, init) => {
      const request = new Request(input, init);
      if (request.url.startsWith("https://example.test/registry/names")) {
        registryRequests.push(request);
        if (registryRequests.length === 1) {
          return Response.json(
            { error: "transaction not found" },
            { status: 402 },
          );
        }
        return Response.json(
          {
            username: "@paidagent",
            bio: "Agent",
            cryptoId: signer.agentId,
            publicKey: signer.publicKeyBase64,
            registeredAt: "2026-06-13T00:00:00Z",
            expiresAt: "2027-06-13T00:00:00Z",
            status: "active",
            updatedAt: "2026-06-13T00:00:00Z",
          },
          { status: 201 },
        );
      }

      const body = JSON.parse(String(init?.body)) as {
        method: string;
        params: Array<unknown>;
      };
      rpcMethods.push(body.method);
      switch (body.method) {
        case "getTokenAccountsByOwner":
          return Response.json({
            jsonrpc: "2.0",
            id: body.method,
            result: {
              value: [
                {
                  pubkey:
                    rpcMethods.length === 1
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

    const result = await client.registry.registerWithSolanaPayment(
      {
        username: "paidagent",
        bio: "Agent",
        cryptoId: signer.agentId,
        publicKey: signer.publicKeyBase64,
      },
      {
        rpcUrl: "https://solana.example.test",
        secretKey,
        fetch,
        amount: "1",
        to: "F8zMkwbG3hp1k2t3eQWQh9bsh8qrK8CtqfZ2dBrrW3Ee",
        registrationIntervalMs: 0,
      },
    );

    expect(result.identity.username).toBe("@paidagent");
    expect(result.payment.signature).toBe(transaction);
    expect(registryRequests).toHaveLength(2);
    const body = (await registryRequests[1]!.json()) as {
      payment: Record<string, string>;
      username: string;
    };
    expect(body.username).toBe("@paidagent");
    expect(body.payment).toMatchObject({
      amount: "1",
      asset: "USDC",
      from: signer.agentId,
      network: SOLANA_MAINNET_NETWORK,
      onChainTx: transaction,
      transaction,
      tx: transaction,
      "metadata.domain": "tiny.place",
      "metadata.identity": "@paidagent",
      "metadata.onChainTx": transaction,
      "metadata.publicKey": signer.publicKeyBase64,
      "metadata.purpose": "registration",
      "metadata.transaction": transaction,
      "metadata.tx": transaction,
    });
    expect(rpcMethods).toEqual([
      "getTokenAccountsByOwner",
      "getTokenAccountsByOwner",
      "getLatestBlockhash",
      "sendTransaction",
      "getSignatureStatuses",
    ]);
  });

  it("uses x402 payment challenges for paid Solana registrations", async () => {
    const seed = new Uint8Array(32).fill(23);
    const signer = await LocalSigner.fromSeed(seed);
    const secretKey = new Uint8Array(64);
    secretKey.set(seed, 0);
    secretKey.set(signer.publicKey, 32);
    const registryRequests: Array<Request> = [];
    const transaction =
      "5q22im1eoEeoJMhsshDkoh4tNV1WPUfyaJXHwyGqcpfmtpY1ZCC665nc5chyEwwau4JoR7BUnCbxWn5BW5WzR3NC";
    const challenge = {
      error: "x402 payment is required",
      payment: {
        scheme: "exact",
        network: SOLANA_MAINNET_NETWORK,
        asset: "USDC",
        amount: "2",
        from: signer.agentId,
        to: "F8zMkwbG3hp1k2t3eQWQh9bsh8qrK8CtqfZ2dBrrW3Ee",
        metadata: {
          domain: "tiny.place",
          identity: "@challengeagent",
          purpose: "registration",
        },
      },
    };
    const fetch: typeof globalThis.fetch = async (input, init) => {
      const request = new Request(input, init);
      if (request.url.startsWith("https://example.test/registry/names")) {
        registryRequests.push(request);
        if (registryRequests.length === 1) {
          return Response.json(challenge, {
            status: 402,
            headers: {
              "X-Payment-Required": toBase64Url(JSON.stringify(challenge)),
            },
          });
        }
        return Response.json(
          {
            username: "@challengeagent",
            bio: "Agent",
            cryptoId: signer.agentId,
            publicKey: signer.publicKeyBase64,
            registeredAt: "2026-06-13T00:00:00Z",
            expiresAt: "2027-06-13T00:00:00Z",
            status: "active",
            updatedAt: "2026-06-13T00:00:00Z",
          },
          { status: 201 },
        );
      }

      const body = JSON.parse(String(init?.body)) as {
        method: string;
        params: Array<unknown>;
      };
      switch (body.method) {
        case "getTokenAccountsByOwner":
          return Response.json({
            jsonrpc: "2.0",
            id: body.method,
            result: {
              value: [
                {
                  pubkey:
                    body.params[0] === signer.agentId
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

    const result = await client.registry.registerWithSolanaPayment(
      {
        username: "challengeagent",
        bio: "Agent",
        cryptoId: signer.agentId,
        publicKey: signer.publicKeyBase64,
      },
      {
        rpcUrl: "https://solana.example.test",
        secretKey,
        fetch,
        registrationIntervalMs: 0,
      },
    );

    expect(result.identity.username).toBe("@challengeagent");
    expect(registryRequests).toHaveLength(2);
    const body = (await registryRequests[1]!.json()) as {
      payment: Record<string, string>;
    };
    expect(body.payment).toMatchObject({
      amount: "2",
      asset: "USDC",
      from: signer.agentId,
      network: SOLANA_MAINNET_NETWORK,
      to: "F8zMkwbG3hp1k2t3eQWQh9bsh8qrK8CtqfZ2dBrrW3Ee",
      tx: transaction,
      "metadata.identity": "@challengeagent",
      "metadata.purpose": "registration",
    });
  });

  it("recovers paid registrations that persist before a server error", async () => {
    const seed = new Uint8Array(32).fill(24);
    const signer = await LocalSigner.fromSeed(seed);
    const secretKey = new Uint8Array(64);
    secretKey.set(seed, 0);
    secretKey.set(signer.publicKey, 32);
    const registryRequests: Array<Request> = [];
    const transaction =
      "5q22im1eoEeoJMhsshDkoh4tNV1WPUfyaJXHwyGqcpfmtpY1ZCC665nc5chyEwwau4JoR7BUnCbxWn5BW5WzR3NC";
    const identity = {
      username: "@recovered",
      bio: "Agent",
      cryptoId: signer.agentId,
      publicKey: signer.publicKeyBase64,
      registeredAt: "2026-06-13T00:00:00Z",
      expiresAt: "2027-06-13T00:00:00Z",
      status: "active",
      updatedAt: "2026-06-13T00:00:00Z",
    };
    const fetch: typeof globalThis.fetch = async (input, init) => {
      const request = new Request(input, init);
      if (request.url.startsWith("https://example.test/registry/names")) {
        registryRequests.push(request);
        if (request.method === "GET") {
          return Response.json({
            available: false,
            name: "@recovered",
            identity,
          });
        }
        return Response.json({ error: "internal server error" }, { status: 500 });
      }

      const body = JSON.parse(String(init?.body)) as {
        method: string;
        params: Array<unknown>;
      };
      switch (body.method) {
        case "getTokenAccountsByOwner":
          return Response.json({
            jsonrpc: "2.0",
            id: body.method,
            result: {
              value: [
                {
                  pubkey:
                    body.params[0] === signer.agentId
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

    const result = await client.registry.registerWithSolanaPayment(
      {
        username: "recovered",
        bio: "Agent",
        cryptoId: signer.agentId,
        publicKey: signer.publicKeyBase64,
      },
      {
        rpcUrl: "https://solana.example.test",
        secretKey,
        fetch,
        amount: "1",
        to: "F8zMkwbG3hp1k2t3eQWQh9bsh8qrK8CtqfZ2dBrrW3Ee",
        registrationAttempts: 1,
      },
    );

    expect(result.identity.username).toBe("@recovered");
    expect(result.payment.signature).toBe(transaction);
    expect(registryRequests.map((request) => request.method)).toEqual([
      "POST",
      "GET",
    ]);
  });

  it("retries registration with an existing Solana transaction without resending payment", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(25));
    const registryRequests: Array<Request> = [];
    const onChainTx =
      "5q22im1eoEeoJMhsshDkoh4tNV1WPUfyaJXHwyGqcpfmtpY1ZCC665nc5chyEwwau4JoR7BUnCbxWn5BW5WzR3NC";
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        const request = new Request(input, init);
        registryRequests.push(request);
        return Response.json(
          {
            username: "@retryagent",
            bio: "Agent",
            cryptoId: signer.agentId,
            publicKey: signer.publicKeyBase64,
            registeredAt: "2026-06-13T00:00:00Z",
            expiresAt: "2027-06-13T00:00:00Z",
            status: "active",
            updatedAt: "2026-06-13T00:00:00Z",
          },
          { status: 201 },
        );
      },
    });

    const result = await client.registry.registerWithExistingSolanaPayment(
      {
        username: "retryagent",
        bio: "Agent",
        cryptoId: signer.agentId,
        publicKey: signer.publicKeyBase64,
      },
      {
        amount: "1",
        network: SOLANA_MAINNET_NETWORK,
        asset: "USDC",
        onChainTx,
        to: "F8zMkwbG3hp1k2t3eQWQh9bsh8qrK8CtqfZ2dBrrW3Ee",
        registrationIntervalMs: 0,
      },
    );

    expect(result.identity.username).toBe("@retryagent");
    expect(result.onChainTx).toBe(onChainTx);
    expect(registryRequests).toHaveLength(1);
    const body = (await registryRequests[0]!.json()) as {
      payment: Record<string, string>;
      username: string;
    };
    expect(body.username).toBe("@retryagent");
    expect(body.payment).toMatchObject({
      amount: "1",
      asset: "USDC",
      from: signer.agentId,
      network: SOLANA_MAINNET_NETWORK,
      onChainTx,
      transaction: onChainTx,
      tx: onChainTx,
      "metadata.identity": "@retryagent",
      "metadata.onChainTx": onChainTx,
      "metadata.publicKey": signer.publicKeyBase64,
      "metadata.purpose": "registration",
      "metadata.transaction": onChainTx,
      "metadata.tx": onChainTx,
    });
  });

  it("preserves existing Solana payment details on registration failures", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(26));
    const onChainTx =
      "5q22im1eoEeoJMhsshDkoh4tNV1WPUfyaJXHwyGqcpfmtpY1ZCC665nc5chyEwwau4JoR7BUnCbxWn5BW5WzR3NC";
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async () =>
        Response.json({ error: "internal server error" }, { status: 500 }),
    });

    try {
      await client.registry.registerWithExistingSolanaPayment(
        {
          username: "failedagent",
          bio: "Agent",
          cryptoId: signer.agentId,
          publicKey: signer.publicKeyBase64,
        },
        {
          amount: "1",
          network: SOLANA_MAINNET_NETWORK,
          asset: "USDC",
          onChainTx,
          to: "F8zMkwbG3hp1k2t3eQWQh9bsh8qrK8CtqfZ2dBrrW3Ee",
          registrationAttempts: 1,
        },
      );
      expect.fail("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(TinyPlaceError);
      const failure = error as TinyPlaceError & {
        onChainTx?: string;
        registrationPayment?: Record<string, string>;
      };
      expect(failure.status).toBe(500);
      expect(failure.onChainTx).toBe(onChainTx);
      expect(failure.registrationPayment).toMatchObject({
        onChainTx,
        transaction: onChainTx,
        tx: onChainTx,
      });
    }
  });

  it("preserves fresh Solana payment details on registration failures", async () => {
    const seed = new Uint8Array(32).fill(27);
    const signer = await LocalSigner.fromSeed(seed);
    const secretKey = new Uint8Array(64);
    secretKey.set(seed, 0);
    secretKey.set(signer.publicKey, 32);
    const transaction =
      "2abZ8pQj8pMkVBTMQ9XchSNtfYeF2eM3nK12QUTfW5WCrU8eQjF9zq3f6J7KUE6GsC95iKn2NC84ufqzp6DNkH8E";
    const fetch: typeof globalThis.fetch = async (input, init) => {
      const request = new Request(input, init);
      if (request.url === "https://example.test/registry/names") {
        return Response.json(
          { error: "internal server error" },
          { status: 500 },
        );
      }

      const body = JSON.parse(String(init?.body)) as {
        method: string;
        params: Array<unknown>;
      };
      switch (body.method) {
        case "getTokenAccountsByOwner":
          return Response.json({
            jsonrpc: "2.0",
            id: body.method,
            result: {
              value: [
                {
                  pubkey: "FYBkeQZniT9vpdGGFiT57gbXEYLTTbeqiVmMRLvK87rQ",
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

    try {
      await client.registry.registerWithSolanaPayment(
        {
          username: "failedfresh",
          bio: "Agent",
          cryptoId: signer.agentId,
          publicKey: signer.publicKeyBase64,
        },
        {
          rpcUrl: "https://solana.example.test",
          secretKey,
          fetch,
          amount: "1",
          to: "F8zMkwbG3hp1k2t3eQWQh9bsh8qrK8CtqfZ2dBrrW3Ee",
          registrationAttempts: 1,
        },
      );
      expect.fail("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(TinyPlaceError);
      const failure = error as TinyPlaceError & {
        onChainTx?: string;
        registrationPayment?: { signature?: string };
      };
      expect(failure.status).toBe(500);
      expect(failure.onChainTx).toBe(transaction);
      expect(failure.registrationPayment?.signature).toBe(transaction);
    }
  });

  it("exposes x402 payment challenges on TinyPlaceError", async () => {
    const challenge = {
      error: "x402 payment is required",
      payment: {
        scheme: "exact",
        network: SOLANA_MAINNET_NETWORK,
        asset: "USDC",
        amount: "1",
        from: "payer",
        to: "recipient",
        metadata: { domain: "tiny.place" },
      },
    };
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      fetch: async () =>
        Response.json(
          { error: "body challenge unavailable" },
          {
            status: 402,
            headers: {
              "X-Payment-Required": toBase64Url(JSON.stringify(challenge)),
            },
          },
        ),
    });

    await expect(
      client.registry.register({
        username: "@agent",
        bio: "Agent",
        cryptoId: "payer",
        publicKey: "public",
      }),
    ).rejects.toMatchObject({
      paymentRequired: {
        payment: {
          amount: "1",
          asset: "USDC",
          to: "recipient",
        },
      },
    } satisfies Partial<TinyPlaceError>);
  });

  it("signs registration payment methods in backend struct field order", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(21));
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({
          username: "@agent",
          bio: "Agent",
          cryptoId: signer.agentId,
          publicKey: signer.publicKeyBase64,
          registeredAt: "2026-06-13T00:00:00Z",
          expiresAt: "2027-06-13T00:00:00Z",
          status: "active",
          updatedAt: "2026-06-13T00:00:00Z",
        });
      },
    });

    await client.registry.register({
      username: "@agent",
      cryptoId: signer.agentId,
      publicKey: signer.publicKeyBase64,
      paymentMethods: [
        {
          network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
          address: signer.agentId,
          assets: ["USDC"],
        },
      ],
    });

    const body = (await requests[0]!.json()) as {
      signature: string;
    };
    const payload =
      `{"action":"identity.register","fields":{"cryptoId":"${signer.agentId}",` +
      `"paymentMethods":[{"network":"solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",` +
      `"address":"${signer.agentId}","assets":["USDC"]}],"publicKey":"${signer.publicKeyBase64}",` +
      `"username":"@agent"}}`;

    const ok = await verifyFreshSignature(signer, body.signature, payload);
    expect(ok).toBe(true);
  });

  it("exports identity records through the harness-facing alias", async () => {
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({
          identity: { username: "@agent" },
          ledgerTransactions: [
            {
              txId: "ledger_tx_1",
              visibility: "unshielded",
              type: "REGISTRATION",
              network: "solana",
              timestamp: "2026-06-06T12:00:00Z",
              reference: { kind: "identity", id: "@agent" },
              onChainTx: "tx_register",
              status: "SETTLED",
            },
          ],
          exportedAt: "2026-06-06T12:00:00Z",
          verification: { registrationTx: "tx_register" },
          proofs: {
            ownership: {
              algorithm: "ed25519-solana-public-key",
              cryptoId: "crypto",
              publicKey: "public",
              publicKeyMatchesCryptoId: true,
            },
            ledgerReferences: [
              {
                txId: "ledger_tx_1",
                onChainTx: "tx_register",
                network: "solana",
                status: "SETTLED",
                type: "REGISTRATION",
                reference: { kind: "identity", id: "@agent" },
              },
            ],
          },
        });
      },
    });

    const exported = await client.registry.exportIdentity("@agent");

    expect(exported.proofs.ownership).toMatchObject({
      algorithm: "ed25519-solana-public-key",
      cryptoId: "crypto",
      publicKeyMatchesCryptoId: true,
    });
    expect(exported.proofs.ledgerReferences).toEqual([
      expect.objectContaining({
        onChainTx: "tx_register",
        reference: { kind: "identity", id: "@agent" },
      }),
    ]);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.method).toBe("GET");
    expect(requests[0]!.url).toBe(
      "https://example.test/registry/names/%40agent/export",
    );
  });

  it("signs profile visibility updates with null omitted fields", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(16));
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({
          activity: false,
          groups: true,
          broadcasts: true,
          attestations: true,
          agentCard: true,
          searchEngineIndexing: false,
        });
      },
    });

    await client.registry.updateProfileVisibility("@agent", {
      activity: false,
      searchEngineIndexing: false,
    });

    expect(requests).toHaveLength(1);
    const request = requests[0]!;
    expect(request.method).toBe("PUT");
    expect(request.url).toBe(
      "https://example.test/registry/names/%40agent/profile-visibility",
    );

    const body = (await request.json()) as {
      activity: boolean;
      agentCard?: boolean;
      attestations?: boolean;
      broadcasts?: boolean;
      groups?: boolean;
      searchEngineIndexing: boolean;
      signature: string;
    };
    expect(body).toMatchObject({
      activity: false,
      searchEngineIndexing: false,
    });
    expect(body.signature).toBeTruthy();

    const ok = await verifyFreshSignature(
      signer,
      body.signature,
      canonicalPayload("identity.profile.visibility", {
        activity: false,
        agentCard: null,
        attestations: null,
        broadcasts: null,
        groups: null,
        searchEngineIndexing: false,
        username: "@agent",
      }),
    );
    expect(ok).toBe(true);
  });

  it("treats renewal and auction claim responses as identities", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(17));
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({
          username: "@agent",
          bio: "Agent",
          cryptoId: signer.agentId,
          publicKey: signer.publicKeyBase64,
          registeredAt: "2026-06-13T00:00:00Z",
          expiresAt: "2027-06-13T00:00:00Z",
          status: "active",
          updatedAt: "2026-06-13T00:00:00Z",
        });
      },
    });

    const renewed = await client.registry.renew("@agent", {
      payment: { tx: "tx_renew" },
    });
    const claimed = await client.registry.claim("@agent", {
      cryptoId: signer.agentId,
      publicKey: signer.publicKeyBase64,
      payment: { tx: "tx_claim" },
    });

    expect(renewed.username).toBe("@agent");
    expect(claimed.publicKey).toBe(signer.publicKeyBase64);
    expect(requests.map((request) => [request.method, request.url])).toEqual([
      ["POST", "https://example.test/registry/names/%40agent/renew"],
      ["POST", "https://example.test/registry/names/%40agent/claim"],
    ]);
  });

  it("sends subname delete ownership signatures in the header", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(18));
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({
          username: "@agent",
          bio: "Agent",
          cryptoId: signer.agentId,
          publicKey: signer.publicKeyBase64,
          subnames: [],
          registeredAt: "2026-06-13T00:00:00Z",
          expiresAt: "2027-06-13T00:00:00Z",
          status: "active",
          updatedAt: "2026-06-13T00:00:00Z",
        });
      },
    });

    const updated = await client.registry.deleteSubname("@agent", "@agent/v2");

    expect(updated.subnames).toEqual([]);
    expect(requests).toHaveLength(1);
    const request = requests[0]!;
    expect(request.method).toBe("DELETE");
    expect(request.url).toBe(
      "https://example.test/registry/names/%40agent/subnames/%40agent%2Fv2",
    );
    expect(request.headers.get("Authorization")).toBeNull();
    expect(request.headers.get("X-TinyPlace-Signature")).toBeTruthy();
    await expect(request.text()).resolves.toBe("");

    const ok = await verifyFreshSignature(
      signer,
      request.headers.get("X-TinyPlace-Signature")!,
      canonicalPayload("identity.subname.delete", {
        subname: "@agent/v2",
        username: "@agent",
      }),
    );
    expect(ok).toBe(true);
  });
});
