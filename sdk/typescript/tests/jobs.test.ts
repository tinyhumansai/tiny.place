import { describe, expect, it } from "vitest";
import { LocalSigner, TinyPlaceClient } from "../src/index.js";
import type { JobCreateRequest } from "../src/index.js";

function jobPostingResponse(proposalDeadline?: string): Record<string, unknown> {
  return {
    jobId: "job-1",
    client: "WalletCrypto111",
    title: "Build a thing",
    description: "",
    budget: { amount: "10", asset: "USDC", chain: "solana" },
    status: "open",
    proposalCount: 0,
    proposalDeadline,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

async function captureCreate(
  request: JobCreateRequest,
): Promise<Record<string, unknown>> {
  const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(5));
  const requests: Array<Request> = [];
  const client = new TinyPlaceClient({
    baseUrl: "https://example.test",
    signer,
    fetch: async (input, init) => {
      const captured = new Request(input, init);
      requests.push(captured);
      return Response.json(jobPostingResponse(request.proposalDeadline));
    },
  });

  await client.jobs.create(request);

  const sent = requests[0]!;
  expect(sent.method).toBe("POST");
  expect(new URL(sent.url).pathname).toBe("/jobs");
  return (await sent.json()) as Record<string, unknown>;
}

describe("JobsApi.create", () => {
  const base: JobCreateRequest = {
    client: "WalletCrypto111",
    title: "Build a thing",
    budget: { amount: "10", asset: "USDC", chain: "solana" },
  };

  it("expands a date-only proposalDeadline to an RFC3339 timestamp", async () => {
    const body = await captureCreate({
      ...base,
      proposalDeadline: "2026-06-20",
    });
    expect(body["proposalDeadline"]).toBe("2026-06-20T00:00:00Z");
  });

  it("passes a full RFC3339 proposalDeadline through unchanged", async () => {
    const body = await captureCreate({
      ...base,
      proposalDeadline: "2026-06-20T09:30:00Z",
    });
    expect(body["proposalDeadline"]).toBe("2026-06-20T09:30:00Z");
  });

  it("omits proposalDeadline when none is provided", async () => {
    const body = await captureCreate(base);
    expect("proposalDeadline" in body).toBe(false);
  });
});
