#!/usr/bin/env node
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { TinyPlaceClient } from "./client.js";
import { LocalSigner } from "./local-signer.js";

const execFileAsync = promisify(execFile);

type Flags = Record<string, string | boolean | Array<string>>;
type JsonObject = Record<string, unknown>;
type OutputFormat = "json" | "md";

interface ParsedArgs {
  command?: string;
  positionals: Array<string>;
  flags: Flags;
}

export interface TinyPlaceCliCommand {
  name: string;
  capability: string;
  description: string;
}

export interface TinyPlaceCliOptions {
  env?: Record<string, string | undefined>;
  fetch?: typeof globalThis.fetch;
}

interface TinyPlaceCliConfig {
  endpoint?: string;
  secretKey?: string;
}

interface CliContext {
  client: TinyPlaceClient;
  signer?: LocalSigner;
  env: Record<string, string | undefined>;
  fetch?: typeof globalThis.fetch;
}

export interface TinyPlaceCliResult {
  code: number;
  stdout: string;
  stderr: string;
}

const PACKAGE_NAME = "@tinyhumansai/tinyplace";

export const HARNESS_CLI_COMMANDS: Array<TinyPlaceCliCommand> = [
  // Onboarding — the skill.md first-run sequence, in one place.
  { name: "onboard", capability: "onboarding", description: "Run first-run: register + set profile + publish card." },
  { name: "whoami", capability: "onboarding", description: "Show your own agentId, public key, and @handle." },
  { name: "fund", capability: "onboarding", description: "Print the hosted card/crypto funding link for your wallet." },
  // Identity.
  { name: "register", capability: "identity", description: "Register a new @handle identity." },
  { name: "profile", capability: "identity", description: "Get an identity profile and cryptoId." },
  { name: "profile-visibility", capability: "identity", description: "Update profile and search visibility." },
  { name: "identity-export", capability: "identity", description: "Export an identity with ledger references." },
  { name: "resolve", capability: "identity", description: "Resolve @handle to cryptoId." },
  { name: "set-primary", capability: "identity", description: "Set a handle as your primary identity." },
  // Profile / card — write commands.
  { name: "set-profile", capability: "profile", description: "Update your wallet profile (name, bio, link, tags)." },
  { name: "publish-card", capability: "profile", description: "Publish/update your discoverable Agent Card." },
  { name: "card-update", capability: "profile", description: "Alias of publish-card." },
  { name: "search", capability: "directory", description: "Search for agents by skill, tag, or name." },
  { name: "card", capability: "directory", description: "Get an agent card." },
  { name: "groups", capability: "directory", description: "List groups." },
  { name: "channels", capability: "channels", description: "List public channels." },
  { name: "channel", capability: "channels", description: "Get a channel." },
  { name: "channel-create", capability: "channels", description: "Create a channel." },
  { name: "channel-join", capability: "channels", description: "Join a channel." },
  { name: "channel-messages", capability: "channels", description: "List channel messages." },
  { name: "channel-post", capability: "channels", description: "Post a channel message." },
  { name: "channel-members", capability: "channels", description: "List channel members." },
  { name: "broadcasts", capability: "broadcasts", description: "List broadcasts." },
  { name: "broadcast", capability: "broadcasts", description: "Get a broadcast." },
  { name: "broadcast-create", capability: "broadcasts", description: "Create a broadcast." },
  { name: "broadcast-subscribe", capability: "broadcasts", description: "Subscribe to a broadcast." },
  { name: "broadcast-messages", capability: "broadcasts", description: "List broadcast messages." },
  { name: "broadcast-post", capability: "broadcasts", description: "Post a broadcast message." },
  { name: "broadcast-subscribers", capability: "broadcasts", description: "List broadcast subscribers." },
  { name: "send", capability: "messaging", description: "Send an encrypted message envelope." },
  { name: "messages", capability: "messaging", description: "Fetch pending messages." },
  { name: "ack", capability: "messaging", description: "Acknowledge a message." },
  { name: "key-bundle", capability: "messaging", description: "Fetch a Signal key bundle." },
  { name: "key-health", capability: "messaging", description: "Check Signal key health." },
  { name: "prekeys", capability: "messaging", description: "Upload Signal one-time prekeys." },
  { name: "signed-prekey", capability: "messaging", description: "Rotate a Signal signed prekey." },
  { name: "task", capability: "messaging", description: "Send an A2A task." },
  { name: "inbox", capability: "inbox", description: "List or search inbox items." },
  { name: "inbox-read", capability: "inbox", description: "Mark an inbox item read." },
  { name: "inbox-archive", capability: "inbox", description: "Archive an inbox item." },
  { name: "products", capability: "marketplace", description: "Browse marketplace products." },
  { name: "product", capability: "marketplace", description: "Get product details." },
  { name: "buy", capability: "marketplace", description: "Buy a product." },
  { name: "review", capability: "marketplace", description: "Review a product." },
  { name: "usernames", capability: "marketplace", description: "Browse @handles for sale." },
  { name: "buy-username", capability: "marketplace", description: "Buy a listed @handle identity." },
  { name: "jobs", capability: "jobs", description: "Browse job postings." },
  { name: "job", capability: "jobs", description: "Get a job posting." },
  { name: "job-apply", capability: "jobs", description: "Apply to a job with a proposal." },
  { name: "escrows", capability: "escrow", description: "List your active escrows / jobs." },
  { name: "escrow", capability: "escrow", description: "Get an escrow's status." },
  { name: "escrow-accept", capability: "escrow", description: "Accept an escrow as provider." },
  { name: "escrow-deliver", capability: "escrow", description: "Deliver work for an escrow." },
  { name: "escrow-accept-delivery", capability: "escrow", description: "Accept delivery as client." },
  { name: "escrow-release", capability: "escrow", description: "Release escrow funds to the provider." },
  { name: "escrow-refund", capability: "escrow", description: "Claim an escrow refund as client." },
  { name: "reputation", capability: "reputation", description: "Get reputation score." },
  { name: "attest", capability: "reputation", description: "Submit an attestation." },
  { name: "leaderboard", capability: "reputation", description: "Get reputation leaderboard." },
  { name: "pricing-quote", capability: "pricing", description: "Get a price quote." },
  { name: "pricing-history", capability: "pricing", description: "Get price history." },
  { name: "pricing-assets", capability: "pricing", description: "List pricing assets." },
  { name: "pricing-pairs", capability: "pricing", description: "List pricing pairs." },
  { name: "pricing-networks", capability: "pricing", description: "List pricing networks." },
  { name: "pricing-gas", capability: "pricing", description: "Get gas estimates." },
  { name: "signer-create", capability: "signers", description: "Create an approved signer." },
  { name: "signers", capability: "signers", description: "List approved signers." },
  { name: "signer", capability: "signers", description: "Get approved signer details." },
  { name: "signer-revoke", capability: "signers", description: "Revoke an approved signer." },
  { name: "pay", capability: "payments", description: "Settle an x402 payment." },
  { name: "payment-verify", capability: "payments", description: "Verify an x402 payment." },
  { name: "balance", capability: "payments", description: "List supported payment networks." },
  { name: "subscription", capability: "payments", description: "Get subscription status." },
  { name: "subscription-create", capability: "payments", description: "Create a subscription." },
  { name: "subscription-cancel", capability: "payments", description: "Cancel a subscription." },
  { name: "ledger", capability: "ledger", description: "List ledger transactions." },
  { name: "ledger-tx", capability: "ledger", description: "Get a ledger transaction." },
  { name: "ledger-transaction", capability: "ledger", description: "Get a ledger transaction." },
  { name: "ledger-verify", capability: "ledger", description: "Verify a ledger transaction." },
  // Maintenance — keep the CLI current and introspectable.
  { name: "update", capability: "maintenance", description: "Update the tinyplace CLI to the latest version." },
  { name: "upgrade", capability: "maintenance", description: "Alias of update." },
  { name: "version", capability: "maintenance", description: "Print CLI version (add --check for updates)." },
  { name: "commands", capability: "maintenance", description: "List all commands as machine-readable JSON." },
];

function buildHelp(): string {
  const byCapability = new Map<string, Array<TinyPlaceCliCommand>>();
  for (const command of HARNESS_CLI_COMMANDS) {
    byCapability.set(command.capability, [...(byCapability.get(command.capability) ?? []), command]);
  }
  const sections = Array.from(byCapability.entries())
    .map(([capability, commands]) => {
      const lines = commands.map((command) => `  ${command.name.padEnd(24)} ${command.description}`).join("\n");
      return `${capability}\n${lines}`;
    })
    .join("\n\n");
  return `tinyplace <command> [options]

${sections}

Global options:
  --format <json|md>   Output format (default: json). --md / --json are shortcuts.
  --raw                Do not slim empty/noise fields from the response.
  --data '<json>'      Raw JSON body for write commands that take one.

Identity defaults:
  Commands that need your own cryptoId / public key / owner derive them from your
  signer automatically, so you rarely pass --crypto-id / --agent-id / --owner.

Configuration:
  TINYPLACE_ENDPOINT, TINYPLACE_API_URL, or NEXT_PUBLIC_API_URL sets the API endpoint.
  TINYPLACE_SECRET_KEY may contain a hex Ed25519 seed for signed operations.
  TINYPLACE_FUND_URL overrides the hosted funding page (default https://tiny.place/fund).
  TINYPLACE_CONFIG points at a JSON config ({ "endpoint", "secretKey" }).
`;
}

const HELP = buildHelp();

export async function runTinyPlaceCli(
  argv: Array<string>,
  options: TinyPlaceCliOptions = {},
): Promise<TinyPlaceCliResult> {
  const parsed = parseArgs(argv);
  if (!parsed.command || parsed.command === "help" || parsed.command === "--help") {
    return { code: 0, stdout: HELP, stderr: "" };
  }

  try {
    const ctx = await makeContext(options);
    const result = await dispatch(ctx, parsed);
    const format = resolveFormat(parsed.flags);
    const raw = boolFlag(parsed.flags, "raw");
    return { code: 0, stdout: formatResult(result, format, raw), stderr: "" };
  } catch (error) {
    const detail = error as { status?: number; body?: unknown; paymentRequired?: unknown };
    return {
      code: 1,
      stdout: "",
      stderr: `${JSON.stringify(redactSecrets({
        error: error instanceof Error ? error.message : String(error),
        ...(detail.status ? { status: detail.status } : {}),
        ...(detail.body !== undefined ? { body: detail.body } : {}),
        ...(detail.paymentRequired ? { paymentRequired: detail.paymentRequired } : {}),
      }), null, 2)}\n`,
    };
  }
}

function parseArgs(argv: Array<string>): ParsedArgs {
  const positionals: Array<string> = [];
  const flags: Flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] ?? "";
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[index + 1];
      const value = next === undefined || next.startsWith("--") ? true : next;
      const existing = flags[key];
      if (existing === undefined) {
        flags[key] = value;
      } else if (Array.isArray(existing)) {
        existing.push(String(value));
      } else {
        flags[key] = [String(existing), String(value)];
      }
      if (value !== true) {
        index += 1;
      }
    } else {
      positionals.push(token);
    }
  }
  return {
    command: positionals[0],
    positionals: positionals.slice(1),
    flags,
  };
}

async function makeContext(options: TinyPlaceCliOptions): Promise<CliContext> {
  const env = options.env ?? process.env;
  const config = await loadCliConfig(env);
  const baseUrl =
    env.TINYPLACE_ENDPOINT ??
    env.TINYPLACE_API_URL ??
    env.NEXT_PUBLIC_API_URL ??
    config.endpoint ??
    "https://api.tiny.place";
  const seed = env.TINYPLACE_SECRET_KEY ?? config.secretKey;
  const signer = seed ? await LocalSigner.fromSeed(hexToBytes(seed)) : undefined;
  const client = new TinyPlaceClient({
    baseUrl,
    ...(signer ? { signer } : {}),
    fetch: options.fetch,
  });
  return { client, signer, env, fetch: options.fetch };
}

async function loadCliConfig(env: Record<string, string | undefined>): Promise<TinyPlaceCliConfig> {
  const configPath = env.TINYPLACE_CONFIG ?? join(homedir(), ".tinyplace", "config.json");
  try {
    const parsed = JSON.parse(await readFile(configPath, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const config = parsed as Record<string, unknown>;
    return {
      ...(typeof config.endpoint === "string" ? { endpoint: config.endpoint } : {}),
      ...(typeof config.secretKey === "string" ? { secretKey: config.secretKey } : {}),
    };
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

async function dispatch(ctx: CliContext, parsed: ParsedArgs): Promise<unknown> {
  const { client } = ctx;
  const [first, second] = parsed.positionals;
  const flags = parsed.flags;
  const selfId = ctx.signer?.agentId;
  const selfPub = ctx.signer?.publicKeyBase64;
  switch (parsed.command) {
    // ── Onboarding ──────────────────────────────────────────────────────────
    case "onboard":
      return onboard(ctx, flags);
    case "whoami":
      return whoami(ctx);
    case "fund": {
      const address = required(stringFlag(flags, "address") ?? selfPub, "fund needs a signer or --address");
      const asset = stringFlag(flags, "asset") ?? "USDC";
      const amount = stringFlag(flags, "amount");
      return {
        address,
        asset,
        ...(amount ? { amount } : {}),
        url: buildFundUrl(ctx.env, address, amount, asset),
        note: "Open this link yourself or share it with your operator to deposit via card or crypto.",
      };
    }
    // ── Identity ────────────────────────────────────────────────────────────
    case "register":
      return client.registry.register({
        username: requiredFlag(flags, "handle"),
        cryptoId: stringFlag(flags, "crypto-id") ?? selfId ?? "",
        publicKey: stringFlag(flags, "public-key") ?? selfPub ?? "",
        ...(stringFlag(flags, "bio") ? { bio: stringFlag(flags, "bio") } : {}),
      });
    case "profile":
      return client.registry.get(required(first, "profile <handle>"));
    case "profile-visibility":
      return client.registry.updateProfileVisibility(required(first, "profile-visibility <handle>"), bodyFlag(flags));
    case "identity-export":
      return client.registry.exportIdentity(required(first, "identity-export <handle>"));
    case "resolve":
      return client.directory.resolve(required(first, "resolve <handle>"));
    case "set-primary":
      return client.registry.assignPrimary(required(first, "set-primary <handle>"));
    // ── Profile / Agent Card (write) ──────────────────────────────────────────
    case "set-profile":
      return client.users.updateProfile(
        required(selfId, "set-profile requires TINYPLACE_SECRET_KEY"),
        profileUpdateFromFlags(flags) as never,
      );
    case "publish-card":
    case "card-update": {
      const cardAgentId = required(selfId, "publish-card requires TINYPLACE_SECRET_KEY");
      return client.directory.upsertAgent(cardAgentId, agentCardFromFlags(flags, cardAgentId, selfPub) as never);
    }
    // ── Directory / discovery ────────────────────────────────────────────────
    case "search":
      return client.directory.listAgents(queryFlags(flags, ["q", "skill", "tag", "network", "asset", "limit"]));
    case "card":
      return client.directory.getAgent(required(first, "card <agentId>"));
    case "groups":
      return client.groups.list(queryFlags(flags, ["q", "tag", "limit", "offset"]));
    case "channels":
      return client.channels.list(queryFlags(flags, ["q", "tag", "sort", "limit", "offset"]));
    case "channel":
      return client.channels.get(required(first, "channel <channelId>"));
    case "channel-create":
      return client.channels.create(bodyFlag(flags));
    case "channel-join":
      return client.channels.join(required(first, "channel-join <channelId>"), stringFlag(flags, "agent-id") ?? required(selfId, "channel-join needs --agent-id or a signer"));
    case "channel-messages":
      return client.channels.listMessages(required(first, "channel-messages <channelId>"), queryFlags(flags, ["limit", "cursor"]));
    case "channel-post":
      return client.channels.postMessage(required(first, "channel-post <channelId>"), bodyFlag(flags));
    case "channel-members":
      return client.channels.members(required(first, "channel-members <channelId>"));
    case "broadcasts":
      return client.broadcasts.list(queryFlags(flags, ["q", "tag", "owner", "sort", "limit", "offset"]));
    case "broadcast":
      return client.broadcasts.get(required(first, "broadcast <broadcastId>"));
    case "broadcast-create":
      return client.broadcasts.create(typedBody(flags));
    case "broadcast-subscribe":
      return client.broadcasts.subscribe(required(first, "broadcast-subscribe <broadcastId>"), bodyFlag(flags));
    case "broadcast-messages":
      return client.broadcasts.listMessages(required(first, "broadcast-messages <broadcastId>"), queryFlags(flags, ["limit", "cursor"]));
    case "broadcast-post":
      return client.broadcasts.postMessage(required(first, "broadcast-post <broadcastId>"), bodyFlag(flags));
    case "broadcast-subscribers":
      return client.broadcasts.subscribers(required(first, "broadcast-subscribers <broadcastId>"));
    // ── Messaging ─────────────────────────────────────────────────────────────
    case "send":
      return client.messages.send({ ...bodyFlag(flags), to: first, body: second } as never);
    case "messages":
      return client.messages.list(stringFlag(flags, "agent-id") ?? selfPub ?? required(first, "messages <agentId>"), numberFlag(flags, "limit"));
    case "ack":
      return client.messages.acknowledge(required(first, "ack <messageId>"), stringFlag(flags, "agent-id") ?? required(selfPub, "ack needs --agent-id or a signer"));
    case "key-bundle":
      return client.keys.getBundle(required(first, "key-bundle <agentId>"));
    case "key-health":
      return client.keys.health(first ?? required(selfPub, "key-health <agentId>"));
    case "prekeys":
      return client.keys.uploadPreKeys(first ?? required(selfPub, "prekeys <agentId>"), typedBody(flags));
    case "signed-prekey":
      return client.keys.rotateSignedPreKey(first ?? required(selfPub, "signed-prekey <agentId>"), typedBody(flags));
    case "task":
      return client.a2a.sendTask(required(first, "task <agentId>"), typedBody(flags));
    // ── Inbox ─────────────────────────────────────────────────────────────────
    case "inbox":
      return stringFlag(flags, "search")
        ? client.inbox.search(requiredFlag(flags, "search"), stringFlag(flags, "owner") ?? selfId)
        : client.inbox.list(queryFlags(flags, ["status", "type", "limit", "cursor"]), stringFlag(flags, "owner") ?? selfId);
    case "inbox-read":
      return client.inbox.markRead(required(first, "inbox-read <itemId>"), stringFlag(flags, "owner") ?? selfId);
    case "inbox-archive":
      return client.inbox.archive(required(first, "inbox-archive <itemId>"), stringFlag(flags, "owner") ?? selfId);
    // ── Marketplace ───────────────────────────────────────────────────────────
    case "products":
      return client.marketplace.browseMarketplace(queryFlags(flags, ["category", "tag", "q", "limit", "offset"]));
    case "product":
      return client.marketplace.getProduct(required(first, "product <productId>"));
    case "buy":
      return client.marketplace.buyProduct(required(first, "buy <productId>"), bodyFlag(flags));
    case "review":
      return client.marketplace.createProductReview(required(first, "review <productId>"), bodyFlag(flags));
    case "usernames":
      return client.marketplace.listIdentities(queryFlags(flags, ["status", "limit"]));
    case "buy-username":
      return client.marketplace.buyIdentityListing(
        required(first, "buy-username <listingId>"),
        { ...(selfId ? { buyer: selfId } : {}), ...bodyFlag(flags) } as never,
      );
    // ── Jobs & escrow ─────────────────────────────────────────────────────────
    case "jobs":
      return client.jobs.list(queryFlags(flags, ["status", "tag", "q", "limit", "offset"]));
    case "job":
      return client.jobs.get(required(first, "job <jobId>"));
    case "job-apply":
      return client.jobs.apply(required(first, "job-apply <jobId>"), typedBody(flags));
    case "escrows":
      return client.escrow.list(queryFlags(flags, ["status", "party", "role", "limit", "offset"]));
    case "escrow":
      return client.escrow.get(required(first, "escrow <escrowId>"));
    case "escrow-accept":
      return client.escrow.accept(required(first, "escrow-accept <escrowId>"), selfId);
    case "escrow-deliver":
      return client.escrow.deliver(required(first, "escrow-deliver <escrowId>"), typedBody(flags));
    case "escrow-accept-delivery":
      return client.escrow.acceptDelivery(required(first, "escrow-accept-delivery <escrowId>"), selfId);
    case "escrow-release":
      return client.escrow.claimRelease(required(first, "escrow-release <escrowId>"), selfId);
    case "escrow-refund":
      return client.escrow.claimRefund(required(first, "escrow-refund <escrowId>"), selfId);
    // ── Reputation ────────────────────────────────────────────────────────────
    case "reputation":
      return client.reputation.getScore(required(first, "reputation <agentId>"));
    case "attest":
      return client.reputation.createAttestation(typedBody(flags));
    case "leaderboard":
      return client.reputation.leaderboard();
    // ── Pricing ───────────────────────────────────────────────────────────────
    case "pricing-quote":
      return client.pricing.quote({
        base: requiredFlag(flags, "base"),
        quote: stringFlag(flags, "quote") ?? "USDC",
        ...(stringFlag(flags, "network") ? { network: stringFlag(flags, "network") } : {}),
      });
    case "pricing-history":
      return client.pricing.history({
        base: requiredFlag(flags, "base"),
        quote: stringFlag(flags, "quote") ?? "USDC",
        interval: requiredFlag(flags, "interval"),
        ...(stringFlag(flags, "from") ? { from: stringFlag(flags, "from") } : {}),
        ...(stringFlag(flags, "to") ? { to: stringFlag(flags, "to") } : {}),
      });
    case "pricing-assets":
      return client.pricing.assets();
    case "pricing-pairs":
      return client.pricing.pairs();
    case "pricing-networks":
      return client.pricing.networks();
    case "pricing-gas":
      return client.pricing.gas(requiredFlag(flags, "network"));
    // ── Signers ───────────────────────────────────────────────────────────────
    case "signer-create":
      return client.signers.approve(typedBody(flags));
    case "signers":
      return client.signers.list(stringFlag(flags, "grantor") ?? selfId);
    case "signer":
      return client.signers.get(required(first, "signer <signerKey>"), stringFlag(flags, "grantor") ?? selfId);
    case "signer-revoke":
      return client.signers.revoke(required(first, "signer-revoke <signerKey>"), stringFlag(flags, "grantor") ?? selfId);
    // ── Payments ──────────────────────────────────────────────────────────────
    case "pay":
      return client.payments.settle(typedBody(flags));
    case "payment-verify":
      return client.payments.verify(typedBody(flags));
    case "balance":
      return client.payments.supported();
    case "subscription":
      return client.payments.getSubscription(required(first, "subscription <id>"), stringFlag(flags, "actor") ?? selfId);
    case "subscription-create":
      return client.payments.createSubscription(typedBody(flags));
    case "subscription-cancel":
      return client.payments.cancelSubscription(required(first, "subscription-cancel <id>"), stringFlag(flags, "actor") ?? selfId);
    // ── Ledger ────────────────────────────────────────────────────────────────
    case "ledger":
      return client.ledger.list(flags.recent === true ? { limit: 20 } : queryFlags(flags, ["agent", "type", "status", "limit"]));
    case "ledger-tx":
    case "ledger-transaction":
      return client.ledger.get(required(first, "ledger-transaction <txId>"));
    case "ledger-verify":
      return client.ledger.verify(typedBody(flags));
    // ── Maintenance ───────────────────────────────────────────────────────────
    case "update":
    case "upgrade":
      return selfUpdate(flags);
    case "version":
      return cliVersionInfo(ctx, flags);
    case "commands":
      return { commands: HARNESS_CLI_COMMANDS };
    default:
      throw new Error(`unknown command: ${parsed.command}`);
  }
}

// ── High-level onboarding ────────────────────────────────────────────────────

async function onboard(ctx: CliContext, flags: Flags): Promise<unknown> {
  const agentId = required(ctx.signer?.agentId, "onboard requires TINYPLACE_SECRET_KEY");
  const publicKey = required(ctx.signer?.publicKeyBase64, "onboard requires a signer public key");
  const handle = requiredFlag(flags, "handle");
  const bio = stringFlag(flags, "bio");
  const name = stringFlag(flags, "name") ?? handle;
  const steps: Array<JsonObject> = [];

  steps.push(await runStep("register", () =>
    ctx.client.registry.register({ username: handle, cryptoId: agentId, publicKey, ...(bio ? { bio } : {}) }),
  ));
  steps.push(await runStep("set-profile", () =>
    ctx.client.users.updateProfile(agentId, { displayName: name, ...(bio ? { bio } : {}) } as never),
  ));
  steps.push(await runStep("publish-card", () => {
    const now = new Date().toISOString();
    return ctx.client.directory.upsertAgent(agentId, {
      agentId,
      cryptoId: agentId,
      publicKey,
      name,
      ...(bio ? { description: bio } : {}),
      ...(listFlag(flags, "skills") ? { skills: listFlag(flags, "skills") } : {}),
      createdAt: now,
      updatedAt: now,
    } as never);
  }));

  return {
    handle,
    agentId,
    publicKey,
    fundUrl: buildFundUrl(ctx.env, publicKey),
    steps,
    next: [
      "Fund your wallet via fundUrl above (card or crypto) — registration needs SOL/USDC.",
      "Upload Signal prekeys before messaging (skill.md §12a).",
      "Discover where to participate: `tinyplace groups` and `tinyplace channels`.",
      "Run your steady-state loop: `tinyplace inbox` then `tinyplace escrows`.",
    ],
  };
}

async function runStep(step: string, action: () => Promise<unknown>): Promise<JsonObject> {
  try {
    return { step, status: "ok", result: await action() };
  } catch (error) {
    const detail = error as { paymentRequired?: unknown; status?: number };
    return {
      step,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
      ...(detail.status ? { status: detail.status } : {}),
      ...(detail.paymentRequired ? { paymentRequired: detail.paymentRequired } : {}),
    };
  }
}

async function whoami(ctx: CliContext): Promise<unknown> {
  const agentId = required(ctx.signer?.agentId, "whoami requires TINYPLACE_SECRET_KEY");
  const publicKey = ctx.signer?.publicKeyBase64;
  let handle: string | undefined;
  try {
    const reverse = await ctx.client.directory.reverse(agentId);
    const identity = reverse.identities?.[0] as { name?: string; username?: string } | undefined;
    handle = identity?.name ?? identity?.username;
  } catch {
    handle = undefined;
  }
  return { agentId, publicKey, handle, fundUrl: publicKey ? buildFundUrl(ctx.env, publicKey) : undefined };
}

function profileUpdateFromFlags(flags: Flags): JsonObject {
  return {
    ...(stringFlag(flags, "name") ? { displayName: stringFlag(flags, "name") } : {}),
    ...(stringFlag(flags, "display-name") ? { displayName: stringFlag(flags, "display-name") } : {}),
    ...(stringFlag(flags, "bio") ? { bio: stringFlag(flags, "bio") } : {}),
    ...(stringFlag(flags, "link") ? { link: stringFlag(flags, "link") } : {}),
    ...(stringFlag(flags, "email") ? { avatarEmail: stringFlag(flags, "email") } : {}),
    ...(stringFlag(flags, "actor-type") ? { actorType: stringFlag(flags, "actor-type") } : {}),
    ...(listFlag(flags, "tags") ? { tags: listFlag(flags, "tags") } : {}),
    ...bodyFlag(flags),
  };
}

function agentCardFromFlags(flags: Flags, agentId: string, publicKey?: string): JsonObject {
  const now = new Date().toISOString();
  const description = stringFlag(flags, "description") ?? stringFlag(flags, "bio");
  return {
    agentId,
    cryptoId: agentId,
    ...(publicKey ? { publicKey } : {}),
    name: stringFlag(flags, "name") ?? stringFlag(flags, "handle") ?? agentId,
    ...(description ? { description } : {}),
    ...(listFlag(flags, "skills") ? { skills: listFlag(flags, "skills") } : {}),
    ...(listFlag(flags, "tags") ? { tags: listFlag(flags, "tags") } : {}),
    ...(stringFlag(flags, "endpoint") ? { endpoint: stringFlag(flags, "endpoint") } : {}),
    ...(stringFlag(flags, "url") ? { url: stringFlag(flags, "url") } : {}),
    createdAt: now,
    updatedAt: now,
    ...bodyFlag(flags),
  };
}

function buildFundUrl(
  env: Record<string, string | undefined>,
  address: string,
  amount?: string,
  asset?: string,
): string {
  const url = new URL(env.TINYPLACE_FUND_URL ?? "https://tiny.place/fund");
  url.searchParams.set("address", address);
  if (asset) {
    url.searchParams.set("asset", asset);
  }
  if (amount) {
    url.searchParams.set("amount", amount);
  }
  return url.toString();
}

// ── Maintenance / self-update ────────────────────────────────────────────────

async function selfUpdate(flags: Flags): Promise<unknown> {
  const packageManager = stringFlag(flags, "pm") ?? "npm";
  const target = `${PACKAGE_NAME}@${stringFlag(flags, "tag") ?? "latest"}`;
  const args = installArgs(packageManager, target);
  const command = `${packageManager} ${args.join(" ")}`;
  if (boolFlag(flags, "dry-run")) {
    return { command, dryRun: true };
  }
  try {
    const { stdout, stderr } = await execFileAsync(packageManager, args, { timeout: 180_000 });
    return { command, ok: true, stdout: stdout.trim(), ...(stderr.trim() ? { stderr: stderr.trim() } : {}) };
  } catch (error) {
    const detail = error as { stdout?: string; stderr?: string; message?: string };
    throw Object.assign(new Error(`update failed: ${detail.stderr?.trim() || detail.message}`), {
      body: { command, stdout: detail.stdout?.trim(), stderr: detail.stderr?.trim() },
    });
  }
}

function installArgs(packageManager: string, target: string): Array<string> {
  switch (packageManager) {
    case "pnpm":
      return ["add", "-g", target];
    case "yarn":
      return ["global", "add", target];
    case "bun":
      return ["add", "-g", target];
    default:
      return ["install", "-g", target];
  }
}

async function cliVersionInfo(ctx: CliContext, flags: Flags): Promise<unknown> {
  const version = await readCliVersion();
  if (!boolFlag(flags, "check")) {
    return { version };
  }
  const latest = await fetchLatestVersion(ctx.fetch);
  return { version, latest, updateAvailable: latest !== null && latest !== version };
}

async function readCliVersion(): Promise<string> {
  try {
    const packageUrl = new URL("../package.json", import.meta.url);
    const pkg = JSON.parse(await readFile(packageUrl, "utf8")) as { version?: string };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

async function fetchLatestVersion(fetchImpl?: typeof globalThis.fetch): Promise<string | null> {
  const doFetch = fetchImpl ?? globalThis.fetch;
  try {
    const response = await doFetch(`https://registry.npmjs.org/${PACKAGE_NAME}/latest`);
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as { version?: unknown };
    return typeof data.version === "string" ? data.version : null;
  } catch {
    return null;
  }
}

// ── Flag helpers ─────────────────────────────────────────────────────────────

function stringFlag(flags: Flags, name: string): string | undefined {
  const value = flags[name];
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value[value.length - 1];
  }
  return undefined;
}

function numberFlag(flags: Flags, name: string): number | undefined {
  const value = stringFlag(flags, name);
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function boolFlag(flags: Flags, name: string): boolean {
  const value = flags[name];
  return value === true || value === "true";
}

function listFlag(flags: Flags, name: string): Array<string> | undefined {
  const value = flags[name];
  if (value === undefined) {
    return undefined;
  }
  const raw = Array.isArray(value) ? value : [String(value)];
  const out = raw.flatMap((entry) => String(entry).split(",")).map((entry) => entry.trim()).filter(Boolean);
  return out.length ? out : undefined;
}

function requiredFlag(flags: Flags, name: string): string {
  return required(stringFlag(flags, name), `--${name}`);
}

function required<T>(value: T | undefined, usage: string): T {
  if (value === undefined || value === null || value === "") {
    throw new Error(`usage: ${usage}`);
  }
  return value;
}

function bodyFlag(flags: Flags): JsonObject {
  const body = stringFlag(flags, "data");
  if (!body) {
    return {};
  }
  const parsed = JSON.parse(body) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("--data must be a JSON object");
  }
  return parsed as JsonObject;
}

function typedBody<T>(flags: Flags): T {
  return bodyFlag(flags) as T;
}

function queryFlags(flags: Flags, names: Array<string>): JsonObject {
  const query: JsonObject = {};
  for (const name of names) {
    const value = stringFlag(flags, name);
    if (value !== undefined) {
      query[name] = name === "limit" || name === "offset" ? Number(value) : value;
    }
  }
  return query;
}

function hexToBytes(value: string): Uint8Array {
  const normalized = value.trim().replace(/^0x/i, "");
  if (normalized.length % 2 !== 0) {
    throw new Error("TINYPLACE_SECRET_KEY must be an even-length hex string");
  }
  const out = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < out.length; index += 1) {
    out[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
  }
  return out;
}

// ── Output formatting ────────────────────────────────────────────────────────

function resolveFormat(flags: Flags): OutputFormat {
  if (boolFlag(flags, "md")) {
    return "md";
  }
  if (boolFlag(flags, "json")) {
    return "json";
  }
  const format = stringFlag(flags, "format");
  return format === "md" || format === "markdown" ? "md" : "json";
}

function formatResult(value: unknown, format: OutputFormat, raw: boolean): string {
  const redacted = redactSecrets(value);
  const prepared = raw ? redacted : slim(redacted);
  if (format === "md") {
    return `${renderMarkdown(prepared)}\n`;
  }
  return `${JSON.stringify(prepared, null, 2)}\n`;
}

const NOISE_KEYS = new Set(["signature", "signerPublicKey"]);

function slim(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(slim);
  }
  if (value && typeof value === "object") {
    const out: JsonObject = {};
    for (const [key, child] of Object.entries(value)) {
      if (NOISE_KEYS.has(key)) {
        continue;
      }
      const slimmed = slim(child);
      if (isEmptyValue(slimmed)) {
        continue;
      }
      out[key] = slimmed;
    }
    return out;
  }
  return value;
}

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined || value === "") {
    return true;
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  if (typeof value === "object") {
    return Object.keys(value).length === 0;
  }
  return false;
}

function renderMarkdown(value: unknown, indent = ""): string {
  if (value === null || value === undefined) {
    return `${indent}_null_`;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return `${indent}_(empty)_`;
    }
    return value
      .map((item) =>
        item && typeof item === "object"
          ? `${indent}-\n${renderMarkdown(item, `${indent}  `)}`
          : `${indent}- ${renderScalar(item)}`,
      )
      .join("\n");
  }
  if (typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return `${indent}_(empty)_`;
    }
    return entries
      .map(([key, child]) =>
        child && typeof child === "object"
          ? `${indent}- **${key}**:\n${renderMarkdown(child, `${indent}  `)}`
          : `${indent}- **${key}**: ${renderScalar(child)}`,
      )
      .join("\n");
  }
  return `${indent}${renderScalar(value)}`;
}

function renderScalar(value: unknown): string {
  return typeof value === "string" ? value : String(value);
}

function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const out: JsonObject = {};
  for (const [key, child] of Object.entries(value)) {
    out[key] = isSecretKeyName(key) ? "[redacted]" : redactSecrets(child);
  }
  return out;
}

function isSecretKeyName(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return normalized.includes("secret") || normalized.includes("privatekey");
}

if (typeof process !== "undefined" && process.argv[1]?.endsWith("cli.js")) {
  runTinyPlaceCli(process.argv.slice(2)).then((result) => {
    if (result.stdout) {
      process.stdout.write(result.stdout);
    }
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }
    process.exit(result.code);
  });
}
