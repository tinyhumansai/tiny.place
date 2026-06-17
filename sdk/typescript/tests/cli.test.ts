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

  it("derives identity from the signer for whoami and fund", async () => {
    const env = {
      TINYPLACE_ENDPOINT: "https://example.test",
      TINYPLACE_SECRET_KEY: "01".repeat(32),
    };
    const whoami = await runTinyPlaceCli(["whoami"], {
      env,
      fetch: async () => Response.json({ cryptoId: "x", identities: [{ name: "@me" }] }),
    });
    const whoamiOut = JSON.parse(whoami.stdout);
    expect(whoamiOut.handle).toBe("@me");
    expect(typeof whoamiOut.agentId).toBe("string");
    expect(whoamiOut.fundUrl).toContain("https://tiny.place/fund?address=");

    const fund = await runTinyPlaceCli(["fund", "--amount", "25"], {
      env,
      fetch: async () => Response.json({}),
    });
    const fundOut = JSON.parse(fund.stdout);
    expect(fundOut.asset).toBe("USDC");
    expect(fundOut.amount).toBe("25");
    expect(fundOut.url).toContain("amount=25");
  });

  it("routes set-profile through the signer-derived user id", async () => {
    const requests: Array<Request> = [];
    const result = await runTinyPlaceCli(["set-profile", "--name", "Ada", "--bio", "research"], {
      env: { TINYPLACE_ENDPOINT: "https://example.test", TINYPLACE_SECRET_KEY: "01".repeat(32) },
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push(new Request(input, init));
        return Response.json({ ok: true });
      },
    });

    expect(result.code).toBe(0);
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("PUT");
    expect(requests[0].url).toMatch(/\/users\/.+\/profile$/);
  });

  it("renders markdown when --md is passed", async () => {
    const result = await runTinyPlaceCli(["profile", "@agent", "--md"], {
      env: { TINYPLACE_ENDPOINT: "https://example.test" },
      fetch: async () => Response.json({ handle: "@agent", skills: ["a", "b"] }),
    });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("**handle**: @agent");
    expect(result.stdout).toContain("- **skills**:");
  });

  it("slims empty and noise fields unless --raw is passed", async () => {
    const body = {
      handle: "@agent",
      empty: "",
      list: [],
      signature: "sig",
      signerPublicKey: "pk",
      keep: 1,
    };
    const slim = await runTinyPlaceCli(["profile", "@agent"], {
      env: { TINYPLACE_ENDPOINT: "https://example.test" },
      fetch: async () => Response.json(body),
    });
    expect(JSON.parse(slim.stdout)).toEqual({ handle: "@agent", keep: 1 });

    const raw = await runTinyPlaceCli(["profile", "@agent", "--raw"], {
      env: { TINYPLACE_ENDPOINT: "https://example.test" },
      fetch: async () => Response.json(body),
    });
    const rawParsed = JSON.parse(raw.stdout);
    expect(rawParsed.signature).toBe("sig");
    expect(rawParsed.empty).toBe("");
  });

  it("exposes machine-readable commands and a version", async () => {
    const commands = await runTinyPlaceCli(["commands"], {
      env: { TINYPLACE_ENDPOINT: "https://example.test" },
      fetch: async () => Response.json({}),
    });
    const list = JSON.parse(commands.stdout).commands as Array<{ name: string }>;
    expect(Array.isArray(list)).toBe(true);
    expect(list.find((command) => command.name === "onboard")).toBeTruthy();

    const version = await runTinyPlaceCli(["version"], {
      env: {},
      fetch: async () => Response.json({}),
    });
    expect(JSON.parse(version.stdout).version).toBeTruthy();
  });

  it("supports update --dry-run without spawning a process", async () => {
    const result = await runTinyPlaceCli(["update", "--dry-run", "--pm", "pnpm"], {
      env: {},
      fetch: async () => Response.json({}),
    });
    expect(JSON.parse(result.stdout)).toMatchObject({
      dryRun: true,
      command: "pnpm add -g @tinyhumansai/tinyplace@latest",
    });
  });
});

function toBase64Url(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
