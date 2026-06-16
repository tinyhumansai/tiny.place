import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HARNESS_CLI_COMMANDS, runTinyPlaceCli } from "../src/cli.js";

describe("tinyplace CLI", () => {
  it("exposes documented harness command families", () => {
    const byCapability = new Map<string, Array<string>>();
    for (const command of HARNESS_CLI_COMMANDS) {
      byCapability.set(command.capability, [
        ...(byCapability.get(command.capability) ?? []),
        command.name,
      ]);
    }

    for (const capability of [
      "identity",
      "directory",
      "channels",
      "broadcasts",
      "messaging",
      "inbox",
      "marketplace",
      "reputation",
      "pricing",
      "signers",
      "payments",
      "ledger",
    ]) {
      expect(byCapability.get(capability), capability).toBeTruthy();
      expect(byCapability.get(capability)!.length, capability).toBeGreaterThan(0);
    }

    expect(HARNESS_CLI_COMMANDS.map((command) => command.name)).toEqual(
      expect.arrayContaining([
        "register",
        "search",
        "channels",
        "broadcasts",
        "send",
        "inbox",
        "products",
        "reputation",
        "pricing-quote",
        "signer-create",
        "payment-verify",
        "ledger",
        "ledger-tx",
      ]),
    );
  });

  it("dispatches representative commands through the SDK routes and prints JSON", async () => {
    const requests: Array<Request> = [];
    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(new Request(input, init));
      return Response.json({ ok: true });
    };
    const env = { TINYPLACE_ENDPOINT: "https://example.test" };

    const pricing = await runTinyPlaceCli(
      ["pricing-quote", "--base", "SOL", "--quote", "USDC", "--network", "solana:local"],
      { env, fetch },
    );
    const ledger = await runTinyPlaceCli(["ledger", "--recent"], { env, fetch });
    const profile = await runTinyPlaceCli(["profile", "@agent"], { env, fetch });

    expect([pricing.code, ledger.code, profile.code]).toEqual([0, 0, 0]);
    expect(JSON.parse(pricing.stdout)).toEqual({ ok: true });
    expect(requests.map((request) => [request.method, request.url])).toEqual([
      [
        "GET",
        "https://example.test/pricing/quote?base=SOL&quote=USDC&network=solana%3Alocal",
      ],
      ["GET", "https://example.test/ledger/transactions?limit=20"],
      ["GET", "https://example.test/registry/names/%40agent"],
    ]);
  });

  it("returns parseable JSON errors", async () => {
    const result = await runTinyPlaceCli(["profile"], {
      env: { TINYPLACE_ENDPOINT: "https://example.test" },
      fetch: async () => Response.json({ ok: true }),
    });

    expect(result.code).toBe(1);
    expect(JSON.parse(result.stderr)).toMatchObject({
      error: "usage: profile <handle>",
    });
  });

  it("maps payment challenges into parseable JSON errors", async () => {
    const challenge = {
      error: "x402 payment is required",
      payment: {
        scheme: "exact",
        network: "solana:mainnet",
        asset: "USDC",
        amount: "1000000",
        to: "treasury",
      },
    };

    const result = await runTinyPlaceCli(["profile", "@paid"], {
      env: { TINYPLACE_ENDPOINT: "https://example.test" },
      fetch: async () =>
        Response.json(
          { error: "payment required" },
          {
            status: 402,
            headers: {
              "X-Payment-Required": toBase64Url(JSON.stringify(challenge)),
            },
          },
        ),
    });

    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toMatchObject({
      error: "HTTP 402: /registry/names/%40paid",
      status: 402,
      body: { error: "payment required" },
      paymentRequired: {
        payment: {
          amount: "1000000",
          asset: "USDC",
          to: "treasury",
        },
      },
    });
  });

  it("loads signer and endpoint config from the CLI config file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tinyplace-cli-"));
    const configPath = join(dir, "config.json");
    await writeFile(
      configPath,
      JSON.stringify({
        endpoint: "https://configured.example.test",
        secretKey: "01".repeat(32),
      }),
      "utf8",
    );

    const requests: Array<Request> = [];
    const result = await runTinyPlaceCli(
      ["profile-visibility", "@agent", "--data", "{}"],
      {
        env: { TINYPLACE_CONFIG: configPath },
        fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
          requests.push(new Request(input, init));
          return Response.json({ ok: true });
        },
      },
    );

    expect(result.code).toBe(0);
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe(
      "https://configured.example.test/registry/names/%40agent/profile-visibility",
    );
    expect(requests[0].headers.get("X-TinyPlace-Signature")).toBeTruthy();
    expect(requests[0].headers.get("X-TinyPlace-Public-Key")).toBeTruthy();
  });

  it("redacts secret-shaped fields from stdout and stderr JSON", async () => {
    const ok = await runTinyPlaceCli(["profile", "@agent"], {
      env: { TINYPLACE_ENDPOINT: "https://example.test" },
      fetch: async () =>
        Response.json({
          handle: "@agent",
          secretKey: "do-not-print",
          nested: { private_key: "do-not-print" },
        }),
    });
    const failure = await runTinyPlaceCli(["profile", "@agent"], {
      env: { TINYPLACE_ENDPOINT: "https://example.test" },
      fetch: async () =>
        Response.json(
          { error: "bad", privateKey: "do-not-print" },
          { status: 500 },
        ),
    });

    expect(JSON.parse(ok.stdout)).toMatchObject({
      handle: "@agent",
      secretKey: "[redacted]",
      nested: { private_key: "[redacted]" },
    });
    expect(JSON.parse(failure.stderr)).toMatchObject({
      body: { privateKey: "[redacted]" },
    });
    expect(ok.stdout + failure.stderr).not.toContain("do-not-print");
  });
});

function toBase64Url(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
