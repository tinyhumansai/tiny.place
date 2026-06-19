import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HARNESS_CLI_COMMANDS, runTinyPlaceCli } from "../src/cli.js";
import {
  LocalSigner,
  generatePreKeys,
  generateSignedPreKey,
  serializePreKey,
  serializeSignedKey,
} from "../src/index.js";

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
      "feeds",
      "broadcasts",
      "messaging",
      "inbox",
      "bounties",
      "reputation",
      "pricing",
      "signers",
      "payments",
      "ledger",
    ]) {
      expect(byCapability.get(capability), capability).toBeTruthy();
      expect(byCapability.get(capability)!.length, capability).toBeGreaterThan(
        0,
      );
    }
    // Jobs/escrow/marketplace capabilities were removed in favour of bounties.
    expect(byCapability.has("jobs")).toBe(false);
    expect(byCapability.has("escrow")).toBe(false);
    expect(byCapability.has("marketplace")).toBe(false);

    expect(HARNESS_CLI_COMMANDS.map((command) => command.name)).toEqual(
      expect.arrayContaining([
        "register",
        "search",
        "feed",
        "broadcasts",
        "send",
        "inbox",
        "bounties",
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
      const request = new Request(input, init);
      requests.push(request);
      // Reads routed to the GraphQL gateway need a `{ data }` envelope so
      // `client.graphql.*` unwraps cleanly.
      if (new URL(request.url).pathname === "/graphql") {
        return Response.json({
          data: { ledgerTransactions: { transactions: [], count: 0 } },
        });
      }
      return Response.json({ ok: true });
    };
    const env = { TINYPLACE_ENDPOINT: "https://example.test" };

    const pricing = await runTinyPlaceCli(
      [
        "pricing-quote",
        "--base",
        "SOL",
        "--quote",
        "USDC",
        "--network",
        "solana:local",
      ],
      { env, fetch },
    );
    // `ledger` now reads through the batched GraphQL gateway (POST /graphql).
    const ledger = await runTinyPlaceCli(["ledger", "--recent"], {
      env,
      fetch,
    });
    const profile = await runTinyPlaceCli(["profile", "@agent"], {
      env,
      fetch,
    });

    expect([pricing.code, ledger.code, profile.code]).toEqual([0, 0, 0]);
    expect(JSON.parse(pricing.stdout)).toEqual({ ok: true });
    expect(requests.map((request) => [request.method, request.url])).toEqual([
      [
        "GET",
        "https://example.test/pricing/quote?base=SOL&quote=USDC&network=solana%3Alocal",
      ],
      ["POST", "https://example.test/graphql"],
      ["GET", "https://example.test/registry/names/%40agent"],
    ]);
    // The recent-ledger read carries the limit=20 variable to the gateway.
    const ledgerRequest = requests.find(
      (request) => new URL(request.url).pathname === "/graphql",
    )!;
    const ledgerBody = (await ledgerRequest.clone().json()) as {
      query: string;
      variables: { limit?: number };
    };
    expect(ledgerBody.query).toContain("ledgerTransactions");
    expect(ledgerBody.variables.limit).toBe(20);
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

  it("prints the version via `version`, `--version`, and `-v` without any network or key side effects", async () => {
    let fetched = false;
    const fetch = async (): Promise<Response> => {
      fetched = true;
      return Response.json({});
    };
    // No TINYPLACE_SECRET_KEY and no TINYPLACE_CONFIG: the flag forms must not
    // auto-generate a wallet key or hit the network.
    const env = { TINYPLACE_ENDPOINT: "https://example.test" };

    for (const argv of [["version"], ["--version"], ["-v"]]) {
      const result = await runTinyPlaceCli(argv, { env, fetch });
      expect(result.code, argv.join(" ")).toBe(0);
      expect(typeof JSON.parse(result.stdout).version, argv.join(" ")).toBe(
        "string",
      );
    }
    expect(fetched).toBe(false);
  });

  it("derives identity from the signer for whoami and fund", async () => {
    const env = {
      TINYPLACE_ENDPOINT: "https://example.test",
      TINYPLACE_SECRET_KEY: "01".repeat(32),
    };
    const whoami = await runTinyPlaceCli(["whoami"], {
      env,
      fetch: async () =>
        Response.json({ cryptoId: "x", identities: [{ name: "@me" }] }),
    });
    const whoamiOut = JSON.parse(whoami.stdout);
    expect(whoamiOut.handle).toBe("@me");
    expect(typeof whoamiOut.agentId).toBe("string");
    // Fund link targets the base58 SOL wallet (agentId), not the base64 key.
    expect(whoamiOut.fundUrl).toContain(`address=${whoamiOut.agentId}`);
    expect(whoamiOut.fundUrl).toContain("asset=SOL");

    const fund = await runTinyPlaceCli(["fund", "--amount", "25"], {
      env,
      fetch: async () => Response.json({}),
    });
    const fundOut = JSON.parse(fund.stdout);
    expect(fundOut.asset).toBe("USDC");
    expect(fundOut.amount).toBe("25");
    expect(fundOut.url).toContain("amount=25");
    // The deposit address is base58 (no base64-only +, /, = characters).
    expect(fundOut.address).toBe(whoamiOut.agentId);
    expect(fundOut.address).not.toMatch(/[/+=]/);
  });

  it("dumps diagnostics via `debug`/`doctor` without leaking the secret", async () => {
    const env = {
      TINYPLACE_ENDPOINT: "https://example.test",
      TINYPLACE_SECRET_KEY: "01".repeat(32),
      TINYPLACE_CONFIG: "/tmp/tinyplace-debug-test/config.json",
    };
    const fetch = async (): Promise<Response> => Response.json({});
    for (const command of ["debug", "doctor"]) {
      const result = await runTinyPlaceCli([command], { env, fetch });
      const out = JSON.parse(result.stdout);
      expect(result.code, command).toBe(0);
      // Server + RPC URLs and their resolution source.
      expect(out.server.baseUrl).toBe("https://example.test");
      expect(out.server.source).toBe("env:TINYPLACE_ENDPOINT");
      expect(out.server.rpcUrl).toBe("https://example.test/solana/rpc");
      // Local file paths.
      expect(out.paths.config).toBe("/tmp/tinyplace-debug-test/config.json");
      expect(out.paths.signalDir).toBe("/tmp/tinyplace-debug-test/signal");
      expect(out.paths.signalStore).toContain(
        "/tmp/tinyplace-debug-test/signal/",
      );
      // Identity is reported by its public address + source, never the secret.
      expect(typeof out.identity.agentId).toBe("string");
      expect(out.identity.source).toBe("env:TINYPLACE_SECRET_KEY");
      expect(typeof out.runtime.node).toBe("string");
      // The 32-byte seed must not appear anywhere in the output.
      expect(result.stdout).not.toContain("01".repeat(32));
    }
  });

  it("routes set-profile through the signer-derived user id", async () => {
    const requests: Array<Request> = [];
    const result = await runTinyPlaceCli(
      ["set-profile", "--name", "Ada", "--bio", "research"],
      {
        env: {
          TINYPLACE_ENDPOINT: "https://example.test",
          TINYPLACE_SECRET_KEY: "01".repeat(32),
        },
        fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
          requests.push(new Request(input, init));
          return Response.json({ ok: true });
        },
      },
    );

    expect(result.code).toBe(0);
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("PUT");
    expect(requests[0].url).toMatch(/\/users\/.+\/profile$/);
  });

  it("renders markdown when --md is passed", async () => {
    const result = await runTinyPlaceCli(["profile", "@agent", "--md"], {
      env: { TINYPLACE_ENDPOINT: "https://example.test" },
      fetch: async () =>
        Response.json({ handle: "@agent", skills: ["a", "b"] }),
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
    const list = JSON.parse(commands.stdout).commands as Array<{
      name: string;
    }>;
    expect(Array.isArray(list)).toBe(true);
    expect(list.find((command) => command.name === "onboard")).toBeTruthy();

    const version = await runTinyPlaceCli(["version"], {
      env: {},
      fetch: async () => Response.json({}),
    });
    expect(JSON.parse(version.stdout).version).toBeTruthy();
  });

  it("supports update --dry-run without spawning a process", async () => {
    const result = await runTinyPlaceCli(
      ["update", "--dry-run", "--pm", "pnpm"],
      {
        env: {},
        fetch: async () => Response.json({}),
      },
    );
    expect(JSON.parse(result.stdout)).toMatchObject({
      dryRun: true,
      command: "pnpm add -g @tinyhumansai/tinyplace@latest",
    });
  });

  it("routes `raw <command>` like the bare command and lists raw commands alone", async () => {
    const requests: Array<Request> = [];
    const routed = await runTinyPlaceCli(["raw", "profile", "@agent"], {
      env: { TINYPLACE_ENDPOINT: "https://example.test" },
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push(new Request(input, init));
        return Response.json({ ok: true });
      },
    });
    expect(JSON.parse(routed.stdout)).toEqual({ ok: true });
    expect(requests[0].url).toBe(
      "https://example.test/registry/names/%40agent",
    );

    const list = await runTinyPlaceCli(["raw"], {
      env: { TINYPLACE_ENDPOINT: "https://example.test" },
      fetch: async () => Response.json({}),
    });
    const commands = JSON.parse(list.stdout).commands as Array<{
      name: string;
    }>;
    // `profile-feed` is a raw command; bare `feed` is now a workflow, so it (like
    // `status`) is excluded from the raw-only listing.
    expect(commands.find((command) => command.name === "profile-feed")).toBeTruthy();
    expect(commands.find((command) => command.name === "feed")).toBeFalsy();
    expect(commands.find((command) => command.name === "status")).toBeFalsy();
  });

  it("aggregates the steady-state snapshot with `status`", async () => {
    const env = {
      TINYPLACE_ENDPOINT: "https://example.test",
      TINYPLACE_SECRET_KEY: "01".repeat(32),
    };
    const result = await runTinyPlaceCli(["status"], {
      env,
      fetch: async (input: RequestInfo | URL) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url.includes("/inbox/counts")) return Response.json({ unread: 2 });
        if (url.includes("/inbox"))
          return Response.json({ items: [{ id: "i1" }] });
        // Your bounties are read through the batched GraphQL gateway.
        if (url.includes("/graphql"))
          return Response.json({ data: { bounties: [{ bountyId: "b1" }] } });
        if (url.includes("/keys/"))
          return Response.json({ lowOneTimePreKeys: true });
        return Response.json({ messages: [{ id: "m1" }] });
      },
    });
    expect(result.code).toBe(0);
    const snapshot = JSON.parse(result.stdout);
    expect(snapshot.counts.unread).toBe(2);
    expect(snapshot.bounties.count).toBe(1);
    expect(snapshot.attention).toEqual(
      expect.arrayContaining([expect.stringContaining("unread")]),
    );
  });

  it("aggregates discovery sources with `discover`", async () => {
    const result = await runTinyPlaceCli(["discover"], {
      env: { TINYPLACE_ENDPOINT: "https://example.test" },
      fetch: async (input: RequestInfo | URL) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url.includes("/groups"))
          return Response.json({ groups: [{ id: "g1" }] });
        return Response.json({ agents: [{ id: "a1" }] });
      },
    });
    expect(result.code).toBe(0);
    const discover = JSON.parse(result.stdout);
    expect(discover.groups.count).toBe(1);
    expect(discover.agents.count).toBe(1);
  });

  it("auto-generates and persists an identity key in managed mode", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tinyplace-managed-"));
    const configPath = join(dir, "config.json");
    const savedConfig = process.env.TINYPLACE_CONFIG;
    const savedSecret = process.env.TINYPLACE_SECRET_KEY;
    process.env.TINYPLACE_CONFIG = configPath;
    delete process.env.TINYPLACE_SECRET_KEY;
    try {
      // No options.env -> managed mode -> CLI owns the key. `version` needs no network.
      const first = await runTinyPlaceCli(["version"]);
      expect(first.code).toBe(0);
      const persisted = JSON.parse(await readFile(configPath, "utf8"));
      expect(persisted.secretKey).toMatch(/^[0-9a-f]{64}$/);

      const second = await runTinyPlaceCli(["version"]);
      expect(second.code).toBe(0);
      const reused = JSON.parse(await readFile(configPath, "utf8"));
      expect(reused.secretKey).toBe(persisted.secretKey);
    } finally {
      if (savedConfig === undefined) delete process.env.TINYPLACE_CONFIG;
      else process.env.TINYPLACE_CONFIG = savedConfig;
      if (savedSecret !== undefined)
        process.env.TINYPLACE_SECRET_KEY = savedSecret;
    }
  });

  it("does not auto-generate a key when an explicit env is passed", async () => {
    const requests: Array<Request> = [];
    const result = await runTinyPlaceCli(["profile", "@agent"], {
      env: { TINYPLACE_ENDPOINT: "https://example.test" },
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push(new Request(input, init));
        return Response.json({ ok: true });
      },
    });
    expect(result.code).toBe(0);
    expect(requests[0].headers.get("X-TinyPlace-Signature")).toBeNull();
  });

  it("init sets up the local wallet and prints a browser onboarding link, doing no human-setup calls", async () => {
    const requests: Array<Request> = [];
    const result = await runTinyPlaceCli(["init"], {
      env: {
        TINYPLACE_ENDPOINT: "https://example.test",
        TINYPLACE_SECRET_KEY: "01".repeat(32),
      },
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push(new Request(input, init));
        return Response.json({ ok: true });
      },
    });
    expect(result.code).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.wallet.agentId).toBeTruthy();
    // The bearer grant rides in the URL fragment, never the query string.
    expect(parsed.onboardUrl).toContain("/onboard#grant=");
    expect(parsed.onboardExpiresInMinutes).toBe(10080);
    expect(parsed.next.join(" ")).toContain("browser");
    // init no longer performs profile/card/registration/funding calls — those
    // move to the web flow. It signs the grant offline and makes no requests.
    expect(
      requests.some(
        (request) =>
          /\/users\/.+\/profile$/.test(request.url) ||
          request.url.includes("/directory/agents") ||
          request.url.includes("/register"),
      ),
    ).toBe(false);
  });

  it("init grinds a vanity wallet for the prefix and persists it as the identity", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tinyplace-init-"));
    const configPath = join(dir, "config.json");
    const requests: Array<Request> = [];
    // No secret key: init must mint the wallet itself by grinding. "1" is a
    // leadable base58 prefix, so the grind resolves near-instantly.
    const result = await runTinyPlaceCli(["init", "--vanity", "1"], {
      env: { TINYPLACE_ENDPOINT: "https://example.test", TINYPLACE_CONFIG: configPath },
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push(new Request(input, init));
        return Response.json({ ok: true });
      },
    });

    expect(result.code).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.wallet.agentId.toLowerCase().startsWith("1")).toBe(true);
    expect(parsed.wallet.vanity.prefix).toBe("1");
    expect(parsed.wallet.vanity.matched).toBe(true);
    // The ground key is persisted so later runs reuse the same wallet.
    const saved = JSON.parse(await readFile(configPath, "utf8")) as { secretKey?: string };
    expect(saved.secretKey).toMatch(/^[0-9a-f]{64}$/);
    // The onboarding link is minted from the ground identity.
    expect(parsed.onboardUrl).toContain("/onboard#grant=");
  });

  it("init --no-vanity keeps the existing wallet untouched", async () => {
    const requests: Array<Request> = [];
    const result = await runTinyPlaceCli(["init", "--no-vanity"], {
      env: {
        TINYPLACE_ENDPOINT: "https://example.test",
        TINYPLACE_SECRET_KEY: "01".repeat(32),
      },
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push(new Request(input, init));
        return Response.json({ ok: true });
      },
    });

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout).wallet.vanity).toBeUndefined();
  });

  it("gates post-bounty behind --execute and funds nothing without it", async () => {
    const requests: Array<Request> = [];
    const result = await runTinyPlaceCli(
      ["post-bounty", "--title", "Logo", "--amount", "10", "--asset", "USDC"],
      {
        env: {
          TINYPLACE_ENDPOINT: "https://example.test",
          TINYPLACE_SECRET_KEY: "01".repeat(32),
        },
        fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
          requests.push(new Request(input, init));
          return Response.json({ ok: true });
        },
      },
    );

    expect(result.code).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.status).toBe("needs-confirmation");
    expect(parsed.preview.reward).toEqual({ amount: "10", asset: "USDC" });
    expect(parsed.suggestions[0].run).toBe(
      'tinyplace post-bounty --title "Logo" --amount 10 --asset USDC --execute',
    );
    // Nothing is created or funded until --execute.
    expect(requests).toHaveLength(0);
  });

  it("resolves a @handle, encrypts, and sends a message (ciphertext on the wire)", async () => {
    // Real recipient identity + published bundle so transparent E2E can run X3DH.
    const peer = await LocalSigner.fromSeed(new Uint8Array(32).fill(2));
    const peerPub = peer.publicKeyBase64;
    const signedPreKey = serializeSignedKey(
      await generateSignedPreKey(peer, "spk_1"),
    );
    const [oneTimePreKey] = (await generatePreKeys(peer, 1, 1)).map(
      serializePreKey,
    );
    const bundle = {
      agentId: peerPub,
      identityKey: peerPub,
      signedPreKey,
      oneTimePreKey,
      updatedAt: "2026-06-16T00:00:00.000Z",
    };

    const configDir = await mkdtemp(join(tmpdir(), "tp-cli-msg-"));
    const requests: Array<Request> = [];
    const result = await runTinyPlaceCli(["message", "@peer", "hello there"], {
      env: {
        TINYPLACE_ENDPOINT: "https://example.test",
        TINYPLACE_SECRET_KEY: "01".repeat(32),
        TINYPLACE_CONFIG: join(configDir, "config.json"),
      },
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init);
        requests.push(request);
        const url = request.url;
        if (url.includes("/directory/resolve")) {
          return Response.json({
            identity: { cryptoId: "c1" },
            agent: { publicKey: peerPub },
          });
        }
        if (url.includes("/bundle")) {
          return Response.json(bundle);
        }
        return Response.json({ id: "m-new", to: peerPub });
      },
    });

    expect(result.code).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.status).toBe("done");
    expect(parsed.suggestions[0].run).toBe("tinyplace read");
    expect(requests.some((request) => request.url.includes("/directory/resolve"))).toBe(
      true,
    );
    expect(requests.some((request) => request.url.includes("/bundle"))).toBe(true);

    const send = requests.find((request) => request.method === "PUT");
    expect(send?.url).toContain("/messages");
    const sent = (await send!.json()) as { body: string; type: string };
    // The plaintext never leaves the process: the relay sees ciphertext.
    expect(sent.body).not.toBe("hello there");
    expect(sent.type).toBe("PREKEY_BUNDLE");
  });

  it("status surfaces ready-to-run suggestions alongside attention", async () => {
    const result = await runTinyPlaceCli(["status"], {
      env: {
        TINYPLACE_ENDPOINT: "https://example.test",
        TINYPLACE_SECRET_KEY: "01".repeat(32),
      },
      fetch: async (input: RequestInfo | URL) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url.includes("/inbox/counts")) return Response.json({ unread: 1 });
        if (url.includes("/inbox")) return Response.json({ items: [{ id: "i1" }] });
        if (url.includes("/graphql"))
          return Response.json({ data: { bounties: [{ bountyId: "b1" }] } });
        if (url.includes("/keys/")) return Response.json({ lowOneTimePreKeys: false });
        return Response.json({ messages: [{ id: "m1" }] });
      },
    });

    expect(result.code).toBe(0);
    const runs = (JSON.parse(result.stdout).suggestions as Array<{ run: string }>).map(
      (suggestion) => suggestion.run,
    );
    expect(runs).toEqual(
      expect.arrayContaining([
        "tinyplace raw inbox-read i1",
        "tinyplace read",
        "tinyplace submissions b1",
      ]),
    );
  });

  it("routes raw reads through the batched GraphQL gateway", async () => {
    const env = { TINYPLACE_ENDPOINT: "https://example.test" };
    const capture = (): {
      requests: Array<Request>;
      fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
    } => {
      const requests: Array<Request> = [];
      return {
        requests,
        fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
          const request = new Request(input, init);
          requests.push(request);
          // Every read here goes through /graphql; answer with the matching
          // `{ data }` envelope so the typed gateway methods unwrap.
          const query = ((init?.body as string) ?? "").toString();
          const data: Record<string, unknown> = {};
          if (query.includes("bounties(")) data["bounties"] = [];
          if (query.includes("bounty(")) data["bounty"] = null;
          if (query.includes("agentCard(")) data["agentCard"] = null;
          if (query.includes("ledgerTransactions("))
            data["ledgerTransactions"] = { transactions: [], count: 0 };
          if (query.includes("ledgerTransaction("))
            data["ledgerTransaction"] = null;
          if (query.includes("comments(")) data["comments"] = [];
          if (query.includes("postLikers("))
            data["postLikers"] = { likers: [], count: 0 };
          if (query.includes("homeFeed(")) data["homeFeed"] = { items: [], count: 0 };
          return Response.json({ data });
        },
      };
    };

    const cases: Array<{ args: Array<string>; query: string }> = [
      { args: ["raw", "bounties", "--status", "open"], query: "bounties(" },
      { args: ["raw", "bounty", "bnt_1"], query: "bounty(" },
      { args: ["raw", "card", "agent_1"], query: "agentCard(" },
      { args: ["raw", "ledger", "--recent"], query: "ledgerTransactions(" },
      { args: ["raw", "ledger-tx", "tx_1"], query: "ledgerTransaction(" },
      { args: ["raw", "feed-comments", "@wall", "post_1"], query: "comments(" },
      { args: ["raw", "feed-likers", "@wall", "post_1"], query: "postLikers(" },
    ];

    for (const { args, query } of cases) {
      const { requests, fetch } = capture();
      const result = await runTinyPlaceCli(args, { env, fetch });
      expect(result.code, args.join(" ")).toBe(0);
      expect(
        [requests[0].method, new URL(requests[0].url).pathname],
        args.join(" "),
      ).toEqual(["POST", "/graphql"]);
      const body = (await requests[0].clone().json()) as { query: string };
      expect(body.query, args.join(" ")).toContain(query);
    }
  });

  it("passes the bounties status filter as a GraphQL variable", async () => {
    const requests: Array<Request> = [];
    const result = await runTinyPlaceCli(["raw", "bounties", "--status", "open"], {
      env: { TINYPLACE_ENDPOINT: "https://example.test" },
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push(new Request(input, init));
        return Response.json({ data: { bounties: [] } });
      },
    });
    expect(result.code).toBe(0);
    const body = (await requests[0].clone().json()) as {
      variables: { status?: string };
    };
    expect(body.variables.status).toBe("open");
  });

  it("exposes the graphql guide via commands and help", async () => {
    const commands = await runTinyPlaceCli(["commands"], {
      env: { TINYPLACE_ENDPOINT: "https://example.test" },
      fetch: async () => Response.json({}),
    });
    expect(commands.code).toBe(0);
    const guides = JSON.parse(commands.stdout).guides as Array<{
      topic: string;
      body: string;
    }>;
    const graphql = guides.find((guide) => guide.topic === "graphql");
    expect(graphql).toBeTruthy();
    expect(graphql!.body).toMatch(/batched GraphQL gateway/);
    expect(graphql!.body).toMatch(/429/);

    const help = await runTinyPlaceCli([], {});
    expect(help.stdout).toContain("graphql");
  });

  it("help separates workflows from raw commands", async () => {
    const help = await runTinyPlaceCli([], {});
    expect(help.code).toBe(0);
    expect(help.stdout).toContain("Workflows");
    expect(help.stdout).toContain("tinyplace raw <command>");
    expect(help.stdout).toContain("status");
  });

  it("documents the full feed surface, including likes", () => {
    const feedCommands = HARNESS_CLI_COMMANDS.filter(
      (command) => command.capability === "feeds",
    ).map((command) => command.name);
    expect(feedCommands).toEqual(
      expect.arrayContaining([
        "feed-posts",
        "feed-post",
        "feed-post-get",
        "feed-post-delete",
        "feed-like",
        "feed-unlike",
        "feed-likers",
        "feed-comments",
        "feed-comment",
        "feed-comment-delete",
        "home-feed",
      ]),
    );
  });

  it("dispatches feed reads, likes, and comments to the SDK routes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tinyplace-feed-"));
    const configPath = join(dir, "config.json");
    await writeFile(
      configPath,
      JSON.stringify({
        endpoint: "https://example.test",
        secretKey: "01".repeat(32),
      }),
      "utf8",
    );

    const requests: Array<Request> = [];
    const fetch = async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const request = new Request(input, init);
      requests.push(request);
      // Feed reads (`feed-posts`, `feed-post-get`) route through the GraphQL
      // gateway and need a `{ data }` envelope keyed by the operation.
      if (new URL(request.url).pathname === "/graphql") {
        const query = ((init?.body as string) ?? "").toString();
        const data: Record<string, unknown> = query.includes("posts(")
          ? { posts: { posts: [], count: 0 } }
          : { post: null };
        return Response.json({ data });
      }
      return Response.json({ ok: true, posts: [], likers: [] });
    };
    const env = { TINYPLACE_CONFIG: configPath };
    const run = (
      args: Array<string>,
    ): Promise<{ code: number; stdout: string }> =>
      runTinyPlaceCli(args, { env, fetch });

    const results = await Promise.all([
      run(["feed-posts", "@wall", "--limit", "5"]),
      run(["feed-post-get", "@wall", "post_1"]),
      run(["feed-like", "@wall", "post_1"]),
      run(["feed-unlike", "@wall", "post_1"]),
      run(["feed-likers", "@wall", "post_1", "--limit", "10"]),
      run(["feed-post-delete", "@wall", "post_1"]),
      run(["feed-comment-delete", "@wall", "post_1", "cmt_1"]),
    ]);

    expect(results.map((result) => result.code)).toEqual([0, 0, 0, 0, 0, 0, 0]);

    // 204 deletes must still emit parseable JSON, not the literal `undefined`.
    expect(JSON.parse(results[5].stdout)).toEqual({
      deleted: true,
      handle: "@wall",
      postId: "post_1",
    });
    expect(JSON.parse(results[6].stdout)).toEqual({
      deleted: true,
      handle: "@wall",
      postId: "post_1",
      commentId: "cmt_1",
    });

    const seen = requests
      .map((request) => {
        const url = new URL(request.url);
        return `${request.method} ${url.pathname}`;
      })
      .sort();
    // Reads (posts list, single post, likers) now go through the batched GraphQL
    // gateway; likes/deletes/comment-deletes stay on the signed REST surface.
    expect(seen).toEqual(
      [
        "POST /graphql",
        "POST /graphql",
        "POST /graphql",
        "POST /feeds/%40wall/posts/post_1/likes",
        "DELETE /feeds/%40wall/posts/post_1/likes",
        "DELETE /feeds/%40wall/posts/post_1",
        "DELETE /feeds/%40wall/posts/post_1/comments/cmt_1",
      ].sort(),
    );

    // The post list passes the agent's id as the GraphQL `viewer` so `likedByMe`
    // (viewerHasLiked) hydrates in the same batched request.
    const postsBodies = await Promise.all(
      requests
        .filter((request) => new URL(request.url).pathname === "/graphql")
        .map(
          (request) =>
            request.clone().json() as Promise<{
              query: string;
              variables: { viewer?: string; limit?: number };
            }>,
        ),
    );
    const listBody = postsBodies.find((body) => body.query.includes("posts("))!;
    expect(listBody.variables.viewer).toBeTruthy();
    expect(listBody.variables.limit).toBe(5);
  });
});

function toBase64Url(value: string): string {
  return btoa(value)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
