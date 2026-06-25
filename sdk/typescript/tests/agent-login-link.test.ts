import { describe, expect, it } from "vitest";
import {
  AGENT_LOGIN_LINK_PATH,
  AGENT_LOGIN_LINK_VERSION,
  DEFAULT_AGENT_LINK_TTL_MS,
  LocalSigner,
  agentLoginTokenIsFresh,
  createAgentLoginLink,
  decodeAgentLoginLink,
  publicKeyToBase64,
  sessionSignerFromAgentLoginToken,
} from "../src/index.js";
import type {
  AgentLoginSignerRegistrar,
  AgentLoginToken,
} from "../src/index.js";
import type { X402Authorization } from "../src/x402.js";

/** A registrar that records the grant the agent registers, so tests can assert it. */
function recordingRegistrar(): AgentLoginSignerRegistrar & {
  approved: Array<X402Authorization>;
} {
  const approved: Array<X402Authorization> = [];
  return {
    approved,
    signers: {
      async approve(authorization: X402Authorization): Promise<unknown> {
        approved.push(authorization);
        return { signerKey: "", status: "active" };
      },
    },
  };
}

describe("agent login link (view-as-agent)", () => {
  it("mints a fragment link that round-trips through decode", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(3));
    const client = recordingRegistrar();

    const link = await createAgentLoginLink({
      signer,
      client,
      baseUrl: "https://tiny.place",
    });

    // Token rides in the URL FRAGMENT, never the query string.
    expect(link.url.startsWith(`https://tiny.place${AGENT_LOGIN_LINK_PATH}#`)).toBe(
      true,
    );
    expect(link.url).not.toContain("?");
    expect(link.token.startsWith(`${AGENT_LOGIN_LINK_VERSION}.`)).toBe(true);

    const decoded = decodeAgentLoginLink(link.token);
    expect(decoded).toBeDefined();
    expect(decoded?.agentId).toBe(signer.agentId);
    expect(decoded?.grantorPublicKeyBase64).toBe(signer.publicKeyBase64);
    expect(decoded?.signerKey).toBe(link.decoded.signerKey);

    // Decoding from the full `#fragment` form also works.
    const fromHash = decodeAgentLoginLink(`#${link.token}`);
    expect(fromHash?.agentId).toBe(signer.agentId);
  });

  it("registers an approved-signer grant signed by the agent identity key", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(5));
    const client = recordingRegistrar();

    const link = await createAgentLoginLink({ signer, client });

    expect(client.approved).toHaveLength(1);
    const grant = client.approved[0]!;
    // The grant is an x402 "upto" approval FROM the agent, bound to the agent's
    // key as the grantor (so an unregistered agent still works).
    expect(grant.scheme).toBe("upto");
    expect(grant.from).toBe(signer.agentId);
    expect(grant.metadata?.publicKey).toBe(signer.publicKeyBase64);
    expect(grant.metadata?.signerKey).toBe(link.decoded.signerKey);
    expect(typeof grant.signature).toBe("string");
    expect(grant.signature.length).toBeGreaterThan(0);
    // The persisted expiry is the whole-second one the grant was actually signed
    // with (buildApprovalRequest strips fractional seconds).
    expect(link.decoded.expiresAt).toBe(grant.expiresAt);
    expect(grant.nonce).toBe(link.decoded.approvalNonce);
  });

  it("defaults to a ZERO payment budget (leaked-link funds safety)", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(7));
    const client = recordingRegistrar();

    const link = await createAgentLoginLink({ signer, client });

    expect(link.decoded.budget).toBe("0");
    expect(client.approved[0]!.amount).toBe("0");
  });

  it("honors an explicit non-zero budget opt-in", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(9));
    const client = recordingRegistrar();

    const link = await createAgentLoginLink({
      signer,
      client,
      scope: { budget: "1000000" },
    });

    expect(link.decoded.budget).toBe("1000000");
    expect(client.approved[0]!.amount).toBe("1000000");
  });

  it("rebuilds a session signer whose public key matches the advertised signer key", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(11));
    const client = recordingRegistrar();

    const link = await createAgentLoginLink({ signer, client });
    const decoded = decodeAgentLoginLink(link.token)!;

    const session = await sessionSignerFromAgentLoginToken(decoded);
    // The seed-derived session key must equal the registered signer key, so its
    // signatures are authorized by the grant the backend has on record.
    expect(session.publicKeyHex).toBe(decoded.signerKey);
    expect(publicKeyToBase64).toBeTypeOf("function");
    // The approval nonce is restored so delegated payment signatures bind to the
    // grant.
    expect(session.getApprovalNonce()).toBe(decoded.approvalNonce);

    // The rebuilt key actually signs (proves the seed import worked, no Phantom).
    const sig = await session.sign(new TextEncoder().encode("hello"));
    expect(sig.length).toBe(64);
  });

  it("defaults the TTL to a short window independent of the wallet session", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(13));
    const client = recordingRegistrar();
    const before = Date.now();

    const link = await createAgentLoginLink({ signer, client });

    const expiresMs = Date.parse(link.decoded.expiresAt);
    // Within the default 15-minute window (whole-second rounding tolerated).
    expect(expiresMs).toBeLessThanOrEqual(before + DEFAULT_AGENT_LINK_TTL_MS + 2000);
    expect(expiresMs).toBeGreaterThan(before);
    expect(DEFAULT_AGENT_LINK_TTL_MS).toBeLessThan(7 * 24 * 60 * 60 * 1000);
  });

  it("reports freshness against the token expiry", async () => {
    const fresh: AgentLoginToken = {
      version: AGENT_LOGIN_LINK_VERSION,
      agentId: "Agent",
      grantorPublicKeyBase64: "key",
      sessionSeedBase64Url: "seed",
      approvalNonce: "nonce",
      signerKey: "abc",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      network: "solana:mainnet",
      asset: "USDC",
      budget: "0",
    };
    expect(agentLoginTokenIsFresh(fresh, Date.now())).toBe(true);
    const expired = { ...fresh, expiresAt: new Date(Date.now() - 1000).toISOString() };
    expect(agentLoginTokenIsFresh(expired, Date.now())).toBe(false);
  });

  it("rejects malformed, wrong-version, and incomplete tokens (fail closed)", () => {
    expect(decodeAgentLoginLink("")).toBeUndefined();
    expect(decodeAgentLoginLink("#")).toBeUndefined();
    expect(decodeAgentLoginLink("garbage")).toBeUndefined();
    expect(decodeAgentLoginLink("al1.")).toBeUndefined();
    // Wrong version prefix.
    expect(decodeAgentLoginLink("al9.eyJhIjoxfQ")).toBeUndefined();
    // Valid base64url but missing required fields.
    const partial = Buffer.from(JSON.stringify({ agentId: "x" })).toString(
      "base64url",
    );
    expect(decodeAgentLoginLink(`${AGENT_LOGIN_LINK_VERSION}.${partial}`)).toBeUndefined();
  });

  it("rejects a non-zero, non-positive ttl", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(15));
    const client = recordingRegistrar();
    await expect(
      createAgentLoginLink({ signer, client, ttlMs: 0 }),
    ).rejects.toThrow(/ttlMs/);
    await expect(
      createAgentLoginLink({ signer, client, ttlMs: -1 }),
    ).rejects.toThrow(/ttlMs/);
  });
});
