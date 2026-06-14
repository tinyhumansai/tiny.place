import { describe, expect, it } from "vitest";
import { LocalSigner, TinyPlaceClient } from "../src/index.js";

describe("ArtifactsApi", () => {
  it("lists artifacts with directory auth and typed filters", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(31));
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
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
    const client = new TinyPlaceClient({
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

    const artifact = await client.artifacts.create(
      {
        name: "metadata.json",
        description: "Task output metadata",
        mimeType: "application/json",
        sizeBytes: 42,
        sha256: "a".repeat(64),
        recipients: ["@reader"],
        referenceKind: "task",
        referenceId: "task_123",
        metadata: { format: "summary" },
      },
      "@owner",
    );

    expect(artifact.artifactId).toBe("art_123");
    expect(requests).toHaveLength(1);
    const request = requests[0]!;
    expect(request.method).toBe("POST");
    expect(request.url).toBe("https://example.test/artifacts");
    expect(request.headers.get("X-Agent-ID")).toBe("@owner");
    expect(request.headers.get("X-TinyPlace-Public-Key")).toBe(
      signer.publicKeyBase64,
    );
    expect(request.headers.get("X-TinyPlace-Signature")).toBeTruthy();
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

  it("uses owner auth for recipient updates and revocation", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(33));
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        if (init?.method === "DELETE") {
          return new Response(null, { status: 204 });
        }
        return Response.json({ artifactId: "art_123", owner: "@owner" });
      },
    });

    await client.artifacts.updateRecipients(
      "art_123",
      {
        add: ["@second"],
        remove: ["@reader"],
      },
      "@owner",
    );
    await client.artifacts.remove("art_123", "@owner");

    expect(requests).toHaveLength(2);
    expect(requests[0]!.method).toBe("PUT");
    expect(requests[0]!.url).toBe(
      "https://example.test/artifacts/art_123/recipients",
    );
    expect(requests[0]!.headers.get("X-Agent-ID")).toBe("@owner");
    await expect(requests[0]!.json()).resolves.toEqual({
      add: ["@second"],
      remove: ["@reader"],
    });

    expect(requests[1]!.method).toBe("DELETE");
    expect(requests[1]!.url).toBe("https://example.test/artifacts/art_123");
    expect(requests[1]!.headers.get("X-Agent-ID")).toBe("@owner");
  });

  it("uses recipient auth for metadata and raw downloads", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(34));
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        if (String(input).endsWith("/download")) {
          return new Response("artifact bytes", {
            headers: { "Content-Type": "text/plain" },
          });
        }
        return Response.json({ artifactId: "art_123", owner: "@owner" });
      },
    });

    await client.artifacts.get("art_123", "@reader");
    const download = await client.artifacts.download("art_123", "@reader");

    expect(await download.text()).toBe("artifact bytes");
    expect(requests).toHaveLength(2);
    expect(requests[0]!.method).toBe("GET");
    expect(requests[0]!.url).toBe("https://example.test/artifacts/art_123");
    expect(requests[0]!.headers.get("X-Agent-ID")).toBe("@reader");
    expect(requests[1]!.method).toBe("GET");
    expect(requests[1]!.url).toBe(
      "https://example.test/artifacts/art_123/download",
    );
    expect(requests[1]!.headers.get("X-Agent-ID")).toBe("@reader");
  });
});
