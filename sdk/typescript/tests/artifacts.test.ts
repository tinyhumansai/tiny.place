import { describe, expect, it } from "vitest";
import { LocalSigner, TinyVerseClient } from "../src/index.js";

describe("ArtifactsApi", () => {
  it("lists artifacts with directory auth and typed filters", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(31));
    const requests: Array<Request> = [];
    const client = new TinyVerseClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({ artifacts: [], cursor: "next" });
      },
    });

    const result = await client.artifacts.list({
      role: "owner",
      status: "all",
      referenceKind: "escrow",
      referenceId: "esc_123",
      limit: 10,
    });

    expect(result.cursor).toBe("next");
    expect(requests).toHaveLength(1);
    const request = requests[0]!;
    expect(request.method).toBe("GET");
    expect(request.url).toBe(
      "https://example.test/artifacts?role=owner&status=all&referenceKind=escrow&referenceId=esc_123&limit=10",
    );
    expect(request.headers.get("X-Agent-ID")).toBe(signer.publicKeyBase64);
    expect(request.headers.get("X-TinyPlace-Signature")).toBeTruthy();
  });

  it("creates metadata-only artifacts using backend field names", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(32));
    const requests: Array<Request> = [];
    const client = new TinyVerseClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(
          {
            artifactId: "art_123",
            owner: "@owner",
            name: "metadata.json",
            mimeType: "application/json",
            sizeBytes: 42,
            sha256: "a".repeat(64),
            encryption: "none",
            recipients: ["@reader"],
            expiresAt: "2026-06-20T00:00:00.000Z",
            downloadCount: 0,
            status: "active",
            createdAt: "2026-06-13T00:00:00.000Z",
          },
          { status: 201 },
        );
      },
    });

    const artifact = await client.artifacts.create({
      name: "metadata.json",
      description: "Task output metadata",
      mimeType: "application/json",
      sizeBytes: 42,
      sha256: "a".repeat(64),
      recipients: ["@reader"],
      referenceKind: "task",
      referenceId: "task_123",
      metadata: { format: "summary" },
    });

    expect(artifact.artifactId).toBe("art_123");
    expect(requests).toHaveLength(1);
    const request = requests[0]!;
    expect(request.method).toBe("POST");
    expect(request.url).toBe("https://example.test/artifacts");
    await expect(request.json()).resolves.toEqual({
      name: "metadata.json",
      description: "Task output metadata",
      mimeType: "application/json",
      sizeBytes: 42,
      sha256: "a".repeat(64),
      recipients: ["@reader"],
      referenceKind: "task",
      referenceId: "task_123",
      metadata: { format: "summary" },
    });
  });

  it("updates recipients with add and remove lists", async () => {
    const requests: Array<Request> = [];
    const client = new TinyVerseClient({
      baseUrl: "https://example.test",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({
          artifactId: "art_123",
          owner: "@owner",
          recipients: ["@second"],
          status: "active",
        });
      },
    });

    await client.artifacts.updateRecipients("art_123", {
      add: ["@second"],
      remove: ["@reader"],
    });

    expect(requests).toHaveLength(1);
    const request = requests[0]!;
    expect(request.method).toBe("PUT");
    expect(request.url).toBe("https://example.test/artifacts/art_123/recipients");
    await expect(request.json()).resolves.toEqual({
      add: ["@second"],
      remove: ["@reader"],
    });
  });
});
