import { describe, expect, it } from "vitest";

import {
  createAgentViewLink,
  LocalSigner,
  parseOnboardGrant,
  VIEW_SCOPE,
} from "../src/index.js";

/** Decode the scope array from a `<wallet>:og1.<b64url(claims)>.<sig>` value. */
function scopeOf(fragmentValue: string): Array<string> {
  const token = fragmentValue.slice(fragmentValue.indexOf(":") + 1);
  const body = token.slice("og1.".length);
  const claimsB64 = body.slice(0, body.indexOf("."));
  const claims = JSON.parse(
    Buffer.from(claimsB64, "base64url").toString("utf8"),
  ) as { scope: Array<string> };
  return claims.scope;
}

function fragmentFrom(url: string): string {
  return decodeURIComponent(
    url.slice(url.indexOf("#grant=") + "#grant=".length),
  );
}

describe("createAgentViewLink", () => {
  it("mints a read-only session.view link with no handoff", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(1), {
      siws: false,
    });

    const link = await createAgentViewLink(signer, {
      baseUrl: "https://tiny.place",
    });

    expect(link.url.startsWith("https://tiny.place/auth/agent#grant=")).toBe(
      true,
    );
    // Without a handoff minter the whole grant rides in the fragment.
    const fragment = fragmentFrom(link.url);
    expect(fragment).toBe(link.token);
    expect(fragment.startsWith(`${signer.agentId}:og1.`)).toBe(true);

    // The grant carries ONLY the read-only view scope — never a write action.
    expect(scopeOf(fragment)).toEqual([VIEW_SCOPE]);
    const parsed = parseOnboardGrant(fragment);
    expect(parsed?.wallet).toBe(signer.agentId);
  });

  it("stashes the grant behind a short handoff token when a minter is given", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(2), {
      siws: false,
    });
    let stashed = "";
    const handoff = {
      createHandoff: async (
        grant: string,
      ): Promise<{ token: string; expiresAt: string }> => {
        stashed = grant;
        return {
          token: "abc123HANDOFF7",
          expiresAt: "2030-01-01T00:00:00.000Z",
        };
      },
    };

    const link = await createAgentViewLink(signer, { handoff });

    expect(link.token).toBe("abc123HANDOFF7");
    expect(fragmentFrom(link.url)).toBe("abc123HANDOFF7");
    // The minter received the full grant fragment to stash.
    expect(stashed.startsWith(`${signer.agentId}:og1.`)).toBe(true);
    expect(scopeOf(stashed)).toEqual([VIEW_SCOPE]);
  });

  it("falls back to embedding the full grant when the handoff call fails", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(3), {
      siws: false,
    });
    const handoff = {
      createHandoff: async (): Promise<{
        token: string;
        expiresAt: string;
      }> => {
        throw new Error("handoff endpoint unreachable");
      },
    };

    const link = await createAgentViewLink(signer, { handoff });

    expect(link.token.startsWith(`${signer.agentId}:og1.`)).toBe(true);
    expect(scopeOf(link.token)).toEqual([VIEW_SCOPE]);
  });

  it("honors a custom baseUrl, path, and ttl", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(4), {
      siws: false,
    });
    const before = Date.now();

    const link = await createAgentViewLink(signer, {
      baseUrl: "https://staging.tiny.place/",
      path: "/auth/agent",
      ttlMs: 60_000,
    });

    // Trailing slash on baseUrl is trimmed (no double slash).
    expect(
      link.url.startsWith("https://staging.tiny.place/auth/agent#grant="),
    ).toBe(true);
    const expiry = new Date(link.expiresAt).getTime();
    expect(expiry).toBeGreaterThanOrEqual(before + 60_000);
    expect(expiry).toBeLessThanOrEqual(Date.now() + 60_000 + 1_000);
  });
});
