import { describe, expect, it } from "vitest";

import { LocalSigner, TinyPlaceClient } from "../src/index.js";

const OWNER = "TxVXELYHYYDutEmpzs4oYGj1edUx7p7QwWPF7SMWuWv";

async function clientWith(
  fetch: (input: Request) => Promise<Response>,
): Promise<TinyPlaceClient> {
  const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(7));
  return new TinyPlaceClient({
    baseUrl: "https://example.test",
    signer,
    fetch: async (input, init) => fetch(new Request(input, init)),
  });
}

describe("ContactsApi.status", () => {
  it("maps a 404 (no relationship yet) to status 'none' instead of throwing", async () => {
    // The backend 404s for a relationship that doesn't exist yet; the SDK
    // contract models that as "none" so callers can status()-before-request().
    const client = await clientWith(async () => Response.json({ error: "not found" }, { status: 404 }));
    await expect(client.contacts.status(OWNER)).resolves.toEqual({
      agentId: OWNER,
      status: "none",
    });
  });

  it("returns the backend status when the relationship exists", async () => {
    const client = await clientWith(async () =>
      Response.json({ agentId: OWNER, status: "accepted" }),
    );
    const res = await client.contacts.status(OWNER);
    expect(res.status).toBe("accepted");
  });

  it("rethrows non-404 errors", async () => {
    const client = await clientWith(async () => Response.json({ error: "forbidden" }, { status: 403 }));
    await expect(client.contacts.status(OWNER)).rejects.toThrow();
  });
});
