import { describe, expect, it } from "vitest";
import { TinyPlaceClient } from "../src/index.js";

/**
 * Backward-compatibility tests: when the backend changes shape, omits a field,
 * sends `null`, or sends the wrong type, list selectors must degrade to `[]`
 * rather than throwing `TypeError: x.map is not a function`. Each case feeds a
 * deliberately malformed response and asserts the SDK still returns a usable,
 * empty result.
 */
function clientReturning(body: unknown): TinyPlaceClient {
  return new TinyPlaceClient({
    baseUrl: "https://example.test",
    fetch: async () => Response.json(body),
  });
}

describe("response selectors tolerate backend shape drift", () => {
  it("directory.listAgents → [] when the field is missing", async () => {
    const client = clientReturning({});
    await expect(client.directory.listAgents()).resolves.toEqual({
      agents: [],
    });
  });

  it("directory.listAgents → [] when the field is null", async () => {
    const client = clientReturning({ agents: null });
    await expect(client.directory.listAgents()).resolves.toEqual({
      agents: [],
    });
  });

  it("directory.listAgents → [] when the field is the wrong type", async () => {
    const client = clientReturning({ agents: "oops-renamed" });
    await expect(client.directory.listAgents()).resolves.toEqual({
      agents: [],
    });
  });

  it("directory.listAgents → [] when the whole body is null", async () => {
    const client = clientReturning(null);
    await expect(client.directory.listAgents()).resolves.toEqual({
      agents: [],
    });
  });

  it("findAgentByEncryptionKey does not throw on an empty body", async () => {
    const client = clientReturning({});
    await expect(
      client.directory.findAgentByEncryptionKey("k"),
    ).resolves.toBeUndefined();
  });

  it("feedback.list → [] on an empty body", async () => {
    const client = clientReturning({});
    await expect(client.feedback.list()).resolves.toEqual({ feedback: [] });
  });

  it("jobs.list → [] on a renamed envelope", async () => {
    const client = clientReturning({ results: [{ id: 1 }] });
    const result = await client.jobs.list();
    expect(Array.isArray(result.jobs)).toBe(true);
    expect(result.jobs).toEqual([]);
  });

  it("moderation.listActions → [] when actions is null", async () => {
    const client = clientReturning({ actions: null });
    const result = await client.moderation.listActions();
    expect(result.actions).toEqual([]);
  });

  it("ledger.list → [] on an empty body", async () => {
    const client = clientReturning({});
    const result = await client.ledger.list();
    expect(Array.isArray(result.transactions)).toBe(true);
    expect(result.transactions).toEqual([]);
  });

  it("marketplace.listProducts does not throw on an empty body", async () => {
    const client = clientReturning({});
    const result = await client.marketplace.listProducts();
    expect(Array.isArray(result.products)).toBe(true);
  });
});
