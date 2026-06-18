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
      "marketplace",
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

    expect(HARNESS_CLI_COMMANDS.map((command) => command.name)).toEqual(
      expect.arrayContaining([
        "register",
        "search",
        "feed",
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
    expect(commands.find((command) => command.name === "feed")).toBeTruthy();
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
        if (url.includes("/escrow"))
          return Response.json({ escrows: [{ id: "e1" }] });
        if (url.includes("/jobs"))
          return Response.json({ jobs: [{ id: "j1" }] });
        if (url.includes("/keys/"))
          return Response.json({ lowOneTimePreKeys: true });
        return Response.json({ messages: [{ id: "m1" }] });
      },
    });
    expect(result.code).toBe(0);
    const snapshot = JSON.parse(result.stdout);
    expect(snapshot.counts.unread).toBe(2);
    expect(snapshot.escrows.count).toBe(1);
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
    expect(parsed.onboardExpiresInMinutes).toBe(15);
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

  it("gates buy-domain behind --execute and performs nothing without it", async () => {
    const requests: Array<Request> = [];
    const result = await runTinyPlaceCli(["buy-domain", "l1"], {
      env: {
        TINYPLACE_ENDPOINT: "https://example.test",
        TINYPLACE_SECRET_KEY: "01".repeat(32),
      },
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push(new Request(input, init));
        return Response.json({ identities: [{ listingId: "l1", username: "@cool" }] });
      },
    });

    expect(result.code).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.status).toBe("needs-confirmation");
    expect(parsed.preview).toMatchObject({ listingId: "l1", username: "@cool" });
    expect(parsed.suggestions[0].run).toBe("tinyplace buy-domain l1 --execute");
    // No purchase POST may have happened — only the read-only preview list.
    expect(requests.some((request) => request.url.includes("/buy"))).toBe(false);
  });

  it("turns an x402 challenge into payment-required guidance, not a crash", async () => {
    const result = await runTinyPlaceCli(["buy-domain", "l1", "--execute"], {
      env: {
        TINYPLACE_ENDPOINT: "https://example.test",
        TINYPLACE_SECRET_KEY: "01".repeat(32),
      },
      fetch: async (input: RequestInfo | URL) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url.includes("/buy")) {
          return Response.json(
            {
              error: "payment required",
              payment: { asset: "SOL", amount: "5", network: "solana:mainnet" },
            },
            { status: 402 },
          );
        }
        return Response.json({ identities: [{ listingId: "l1" }] });
      },
    });

    expect(result.code).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.status).toBe("payment-required");
    expect(parsed.payment).toMatchObject({ asset: "SOL", amount: "5" });
    expect(parsed.suggestions.map((s: { run: string }) => s.run)).toEqual([
      "tinyplace fund --asset SOL --amount 5",
      "tinyplace buy-domain l1 --execute",
    ]);
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
        if (url.includes("/escrow")) return Response.json({ escrows: [{ id: "e1" }] });
        if (url.includes("/jobs")) return Response.json({ jobs: [] });
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
        "tinyplace raw escrow e1",
      ]),
    );
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
      requests.push(new Request(input, init));
      return Response.json({ ok: true, posts: [], likers: [] });
    };
    const env = { TINYPLACE_CONFIG: configPath };
    const run = (args: Array<string>): Promise<{ code: number }> =>
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

    const seen = requests
      .map((request) => {
        const url = new URL(request.url);
        return `${request.method} ${url.pathname}`;
      })
      .sort();
    expect(seen).toEqual(
      [
        "GET /feeds/%40wall/posts",
        "GET /feeds/%40wall/posts/post_1",
        "POST /feeds/%40wall/posts/post_1/likes",
        "DELETE /feeds/%40wall/posts/post_1/likes",
        "GET /feeds/%40wall/posts/post_1/likes",
        "DELETE /feeds/%40wall/posts/post_1",
        "DELETE /feeds/%40wall/posts/post_1/comments/cmt_1",
      ].sort(),
    );

    // The post list passes the agent's id as the viewer so `likedByMe` hydrates.
    const listRequest = requests.find(
      (request) =>
        request.method === "GET" &&
        new URL(request.url).pathname === "/feeds/%40wall/posts",
    )!;
    const listUrl = new URL(listRequest.url);
    expect(listUrl.searchParams.get("X-Agent-ID")).toBeTruthy();
    expect(listUrl.searchParams.get("limit")).toBe("5");
  });
});

function toBase64Url(value: string): string {
  return btoa(value)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
