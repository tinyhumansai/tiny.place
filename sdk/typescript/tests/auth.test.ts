import { describe, expect, it } from "vitest";

import { TinyPlaceClient, type SigningKey } from "../src/index.js";
import {
  signDirectoryWrite,
  signDirectoryWriteQuery,
  signFreshCanonicalPayload,
} from "../src/auth.js";

describe("directory write auth", () => {
  it("binds the nonce into header signed payloads", async () => {
    let signedPayload = "";
    const key: SigningKey = {
      agentId: "7YttLkHDoVzP6pYphcCg5GkA2N4GokB3k1drpbUaW7oX",
      sign(data: Uint8Array): Uint8Array {
        signedPayload = new TextDecoder().decode(data);
        return new Uint8Array([1, 2, 3]);
      },
    };

    const headers = await signDirectoryWrite(
      key,
      "public-key",
      "POST",
      "/channels",
      JSON.stringify({ name: "market" }),
    );

    expect(headers["X-TinyPlace-Nonce"]).toBeTruthy();
    expect(signedPayload.split("\n")).toEqual([
      "POST",
      "/channels",
      headers["X-TinyPlace-Date"],
      headers["X-TinyPlace-Nonce"],
      expect.any(String),
    ]);
  });

  it("binds the nonce into query signed payloads", async () => {
    let signedPayload = "";
    const key: SigningKey = {
      agentId: "7YttLkHDoVzP6pYphcCg5GkA2N4GokB3k1drpbUaW7oX",
      sign(data: Uint8Array): Uint8Array {
        signedPayload = new TextDecoder().decode(data);
        return new Uint8Array([1, 2, 3]);
      },
    };

    const requestUri = await signDirectoryWriteQuery(
      key,
      "public-key",
      "GET",
      "/marketplace/stream?X-Agent-ID=%40seller",
      "",
    );
    const url = new URL(requestUri, "https://example.test");

    expect(url.searchParams.get("X-TinyPlace-Nonce")).toBeTruthy();
    expect(signedPayload.split("\n")).toEqual([
      "GET",
      `/marketplace/stream?X-Agent-ID=%40seller&X-TinyPlace-Date=${encodeURIComponent(url.searchParams.get("X-TinyPlace-Date") ?? "")}&X-TinyPlace-Nonce=${encodeURIComponent(url.searchParams.get("X-TinyPlace-Nonce") ?? "")}&X-TinyPlace-Public-Key=public-key`,
      url.searchParams.get("X-TinyPlace-Date"),
      url.searchParams.get("X-TinyPlace-Nonce"),
      expect.any(String),
    ]);
  });

  it("uses SIWS proof tokens directly when a signer exposes one", async () => {
    const key: SigningKey & { siwsSignature(): string } = {
      agentId: "7YttLkHDoVzP6pYphcCg5GkA2N4GokB3k1drpbUaW7oX",
      sign(): Uint8Array {
        throw new Error("SIWS auth should not call sign()");
      },
      siwsSignature(): string {
        return "siws:test-token";
      },
    };

    const headers = await signDirectoryWrite(
      key,
      "public-key",
      "POST",
      "/channels",
      "{}",
    );
    expect(headers["X-TinyPlace-Signature"]).toBe("siws:test-token");
    await expect(signFreshCanonicalPayload(key, "{}")).resolves.toBe(
      "siws:test-token",
    );
  });
});

describe("client auth invalidation", () => {
  it("notifies session recovery for 401 but not ordinary 403 responses", async () => {
    const statuses: Array<number> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      onAuthInvalid: (status): void => {
        statuses.push(status);
      },
      fetch: async (input) => {
        const url = new URL(String(input));
        return Response.json(
          {
            error: url.pathname.endsWith("/unauthorized")
              ? "invalid signature"
              : "forbidden",
          },
          { status: url.pathname.endsWith("/unauthorized") ? 401 : 403 },
        );
      },
    });

    await expect(client.stats.overview()).rejects.toThrow("HTTP 403");
    expect(statuses).toEqual([]);

    await expect(client.docs.identityPage("unauthorized")).rejects.toThrow(
      "HTTP 401",
    );
    expect(statuses).toEqual([401]);
  });
});
