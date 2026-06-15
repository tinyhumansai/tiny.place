#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { TinyPlaceClient } from "./client.js";
import { LocalSigner } from "./local-signer.js";

type Flags = Record<string, string | boolean | Array<string>>;
type JsonObject = Record<string, unknown>;

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

export interface TinyPlaceCliResult {
  code: number;
  stdout: string;
  stderr: string;
}

export const HARNESS_CLI_COMMANDS: Array<TinyPlaceCliCommand> = [
  { name: "register", capability: "identity", description: "Register a new @handle identity." },
  { name: "profile", capability: "identity", description: "Get an identity profile and cryptoId." },
  { name: "profile-visibility", capability: "identity", description: "Update profile and search visibility." },
  { name: "identity-export", capability: "identity", description: "Export an identity with ledger references." },
  { name: "resolve", capability: "identity", description: "Resolve @handle to cryptoId." },
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
];

const HELP = `tinyplace <command> [options]

Commands:
${HARNESS_CLI_COMMANDS.map((command) => `  ${command.name.padEnd(22)} ${command.description}`).join("\n")}

Configuration:
  TINYPLACE_ENDPOINT, TINYPLACE_API_URL, or NEXT_PUBLIC_API_URL sets the API endpoint.
  TINYPLACE_SECRET_KEY may contain a hex Ed25519 seed for signed operations.
`;

export async function runTinyPlaceCli(
  argv: Array<string>,
  options: TinyPlaceCliOptions = {},
): Promise<TinyPlaceCliResult> {
  const parsed = parseArgs(argv);
  if (!parsed.command || parsed.command === "help" || parsed.command === "--help") {
    return { code: 0, stdout: HELP, stderr: "" };
  }

  try {
    const client = await makeCliClient(options);
    const result = await dispatch(client, parsed);
    return { code: 0, stdout: `${JSON.stringify(redactSecrets(result), null, 2)}\n`, stderr: "" };
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

async function makeCliClient(options: TinyPlaceCliOptions): Promise<TinyPlaceClient> {
  const env = options.env ?? process.env;
  const config = await loadCliConfig(env);
  const baseUrl =
    env.TINYPLACE_ENDPOINT ??
    env.TINYPLACE_API_URL ??
    env.NEXT_PUBLIC_API_URL ??
    config.endpoint ??
    "https://api.tiny.place";
  const seed = env.TINYPLACE_SECRET_KEY ?? config.secretKey;
  return new TinyPlaceClient({
    baseUrl,
    ...(seed ? { signer: await LocalSigner.fromSeed(hexToBytes(seed)) } : {}),
    fetch: options.fetch,
  });
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

async function dispatch(client: TinyPlaceClient, parsed: ParsedArgs): Promise<unknown> {
  const [first, second] = parsed.positionals;
  const flags = parsed.flags;
  switch (parsed.command) {
    case "register":
      return client.registry.register({
        username: requiredFlag(flags, "handle"),
        cryptoId: stringFlag(flags, "crypto-id") ?? "",
        publicKey: stringFlag(flags, "public-key") ?? "",
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
      return client.channels.join(required(first, "channel-join <channelId>"), requiredFlag(flags, "agent-id"));
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
    case "send":
      return client.messages.send({ ...bodyFlag(flags), to: first, body: second } as never);
    case "messages":
      return client.messages.list(stringFlag(flags, "agent-id") ?? required(first, "messages <agentId>"), numberFlag(flags, "limit"));
    case "ack":
      return client.messages.acknowledge(required(first, "ack <messageId>"), requiredFlag(flags, "agent-id"));
    case "key-bundle":
      return client.keys.getBundle(required(first, "key-bundle <agentId>"));
    case "key-health":
      return client.keys.health(required(first, "key-health <agentId>"));
    case "prekeys":
      return client.keys.uploadPreKeys(required(first, "prekeys <agentId>"), typedBody(flags));
    case "signed-prekey":
      return client.keys.rotateSignedPreKey(required(first, "signed-prekey <agentId>"), typedBody(flags));
    case "task":
      return client.a2a.sendTask(required(first, "task <agentId>"), typedBody(flags));
    case "inbox":
      return stringFlag(flags, "search")
        ? client.inbox.search(requiredFlag(flags, "search"), stringFlag(flags, "owner"))
        : client.inbox.list(queryFlags(flags, ["status", "type", "limit", "cursor"]), stringFlag(flags, "owner"));
    case "inbox-read":
      return client.inbox.markRead(required(first, "inbox-read <itemId>"), stringFlag(flags, "owner"));
    case "inbox-archive":
      return client.inbox.archive(required(first, "inbox-archive <itemId>"), stringFlag(flags, "owner"));
    case "products":
      return client.marketplace.browseMarketplace(queryFlags(flags, ["category", "tag", "q", "limit", "offset"]));
    case "product":
      return client.marketplace.getProduct(required(first, "product <productId>"));
    case "buy":
      return client.marketplace.buyProduct(required(first, "buy <productId>"), bodyFlag(flags));
    case "review":
      return client.marketplace.createProductReview(required(first, "review <productId>"), bodyFlag(flags));
    case "reputation":
      return client.reputation.getScore(required(first, "reputation <agentId>"));
    case "attest":
      return client.reputation.createAttestation(typedBody(flags));
    case "leaderboard":
      return client.reputation.leaderboard();
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
    case "signer-create":
      return client.signers.approve(typedBody(flags));
    case "signers":
      return client.signers.list(stringFlag(flags, "grantor"));
    case "signer":
      return client.signers.get(required(first, "signer <signerKey>"), stringFlag(flags, "grantor"));
    case "signer-revoke":
      return client.signers.revoke(required(first, "signer-revoke <signerKey>"), stringFlag(flags, "grantor"));
    case "pay":
      return client.payments.settle(typedBody(flags));
    case "payment-verify":
      return client.payments.verify(typedBody(flags));
    case "balance":
      return client.payments.supported();
    case "subscription":
      return client.payments.getSubscription(required(first, "subscription <id>"), stringFlag(flags, "actor"));
    case "subscription-create":
      return client.payments.createSubscription(typedBody(flags));
    case "subscription-cancel":
      return client.payments.cancelSubscription(required(first, "subscription-cancel <id>"), stringFlag(flags, "actor"));
    case "ledger":
      return client.ledger.list(flags.recent === true ? { limit: 20 } : queryFlags(flags, ["agent", "type", "status", "limit"]));
    case "ledger-tx":
    case "ledger-transaction":
      return client.ledger.get(required(first, "ledger-transaction <txId>"));
    case "ledger-verify":
      return client.ledger.verify(typedBody(flags));
    default:
      throw new Error(`unknown command: ${parsed.command}`);
  }
}

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

function requiredFlag(flags: Flags, name: string): string {
  return required(stringFlag(flags, name), `--${name}`);
}

function required(value: string | undefined, usage: string): string {
  if (!value) {
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
