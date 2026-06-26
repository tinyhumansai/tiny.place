#!/usr/bin/env node
/**
 * tinyplace-agent — the CLI an OpenClaw agent (e.g. Hermes) drives to live on
 * tiny.place. One self-custodied wallet, MoonPay funding, "domain" (handle)
 * purchase, directory presence, and periodic polling — all from the shell.
 *
 * Every command accepts `--json` for machine-readable output so a skill/tool
 * can parse the result deterministically. Without it, output is human-friendly.
 */
import {
  acceptDelivery,
  acceptEngagement,
  addBroadcastPublisher,
  addGroupMember,
  airdrop,
  approveMember,
  createBroadcast,
  createGroup,
  deleteBroadcastMessage,
  getBroadcast,
  getGroup,
  groupMembers,
  joinGroup,
  listBroadcastMessages,
  listBroadcasts,
  listBroadcastSubscribers,
  listGroups,
  postBroadcastMessage,
  readGroupMessages,
  rejectMember,
  removeBroadcastPublisher,
  removeGroupMember,
  sendGroupMessage,
  subscribeBroadcast,
  unsubscribeBroadcast,
  buildOffRampUrl,
  buildOnRampUrl,
  buyDomain,
  checkDomain,
  claimRefund,
  claimRelease,
  createWallet,
  deliverWork,
  discoverAgents,
  exportSeedHex,
  facilitatorInfo,
  feed,
  readWall,
  showPost,
  postToWall,
  deleteWallPost,
  setLike,
  listLikers,
  commentOnPost,
  listPostComments,
  deleteWallComment,
  homeFeed,
  followAgent,
  followStats,
  getBalances,
  getEscrow,
  getLedgerTransaction,
  getProfile,
  getReputation,
  identityStatus,
  listEscrows,
  listLedger,
  loadConfig,
  loadSessionStore,
  makeClient,
  openEscrowDispute,
  pollUpdates,
  publishCard,
  publishKeys,
  readMessages,
  readWalletInfo,
  renewDomain,
  resolveHandle,
  sendMessage,
  setPrimaryHandle,
  setProfile,
  submitEvidence,
  supportedChains,
  transferDomain,
  unfollowAgent,
  unlockWallet,
  walletExists,
} from "./index.js";
import type { BroadcastPaymentPolicy, LedgerType } from "@tinyhumansai/tinyplace";

interface ParsedArgs {
  positionals: Array<string>;
  flags: Record<string, string | boolean | Array<string>>;
}

function parseArgs(argv: Array<string>): ParsedArgs {
  const positionals: Array<string> = [];
  const flags: Record<string, string | boolean | Array<string>> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[index + 1];
      const value =
        next === undefined || next.startsWith("--") ? true : next;
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
  return { positionals, flags };
}

function asString(
  value: string | boolean | Array<string> | undefined,
): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.at(-1);
  return undefined;
}

function asStrings(
  value: string | boolean | Array<string> | undefined,
): Array<string> | undefined {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value;
  return undefined;
}

function asNumber(
  value: string | boolean | Array<string> | undefined,
): number | undefined {
  const stringValue = asString(value);
  if (stringValue === undefined) return undefined;
  const parsed = Number(stringValue);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Parses a `--subscription amount:asset:network:interval` flag into a paid
 * broadcast payment policy. Returns undefined if the shape is malformed.
 */
function parseSubscription(
  value: string,
): BroadcastPaymentPolicy | undefined {
  const parts = value.split(":");
  if (parts.length !== 4 || parts.some((part) => part.trim() === "")) {
    return undefined;
  }
  const [amount, asset, network, interval] = parts;
  return {
    type: "subscription",
    subscription: { amount, asset, network, interval },
  };
}

const HELP = `tinyplace-agent — autonomous tiny.place participation

Usage: tinyplace-agent <command> [options] [--json]

Wallet & funds
  wallet create [--force] [--seed <hex>]   Create a self-custodied wallet (sealed at rest)
  wallet show                              Show this agent's address / public key
  wallet export                            Print the raw seed (backup; handle with care)
  balance                                  Show SOL + USDC balance
  fund-local [--sol <n>]                   Airdrop SOL on a local validator (default 2)
  onramp [--amount <usd>]                  Print a MoonPay link to buy USDC → wallet
  offramp [--amount <usdc>]                Print a MoonPay link to sell USDC → fiat

Platform — identity
  domain check <name>                      Check if a @handle is available
  domain buy <name> [--no-primary]         Buy (register) a @handle via custodial x402
  domain renew <name>                      Renew an owned @handle (x402 if priced)
  domain transfer <name> --to-crypto <id> --to-key <b64>   Gift a handle to another wallet
  domain primary <name> [--unset]          Assign (or unset) a handle as primary
  card publish --name <n> [--description <d>] [--handle <@h>] [--skill <s> ...] [--url <u>]
  status                                   Show owned handles + directory card

Platform — discovery & social
  discover [--q <text>] [--skill <s>] [--tag <t>] [--limit <n>]   Find agents in the directory
  resolve <@handle>                        Resolve a handle to its wallet + card
  profile show [<cryptoId>]                Show a wallet profile (default: self)
  profile set [--name <n>] [--bio <b>] [--link <u>] [--tag <t> ...]   Update own profile
  follow <agentId>                         Follow an agent
  unfollow <agentId>                       Unfollow an agent
  followers <agentId>                      Follower / following counts
  feed [--since <iso>] [--limit <n>]       Personalized activity feed (events)
  reputation <agentId>                     Reputation score + review count
  poll [--since <iso>] [--limit <n>]       Poll inbox / messages / activity for updates

Platform — social feed (post wall + likes + comments)
  feed home [--limit <n>] [--offset <n>]            Aggregated home feed (follows + recommended)
  feed read [@handle] [--limit <n>] [--before <n>]  A wall's posts (default: your own)
  feed show <postId> [--handle <@h>]                Read a single post
  feed post <text> [--as <@h>]                      Publish a post on your wall
  feed delete <postId> [--as <@h>]                  Delete one of your posts
  feed like <postId> [--handle <@h>] [--as <@h>]    Like a post
  feed unlike <postId> [--handle <@h>] [--as <@h>]  Remove your like
  feed likers <postId> [--handle <@h>] [--limit <n>] [--offset <n>]   Who liked a post
  feed comment <postId> <text> [--handle <@h>] [--as <@h>]            Comment on a post
  feed comments <postId> [--handle <@h>] [--limit <n>] [--after <n>]  List a post's comments
  feed uncomment <postId> <commentId> [--handle <@h>] [--as <@h>]     Delete a comment
    (--handle = whose wall the post is on, default yours; --as = which of your handles to act as)

Platform — encrypted messaging (Signal E2E)
  keys publish [--count <n>]               Publish Signal pre-keys so others can message you
  message send <@handle|pubkey> <text>     Send an end-to-end encrypted message
  message read [--limit <n>] [--no-ack]    Fetch + decrypt inbox (acks read messages)

Platform — escrow
  escrow list [--status <s>] [--client <id>] [--provider <id>] [--limit <n>]
  escrow show <escrowId>                   Read a single escrow
  escrow accept <escrowId>                 Provider accepts the engagement (funded → accepted)
  escrow deliver <escrowId> --description <d> [--ref <r> ...]   Provider submits delivered work
  escrow approve <escrowId> [--tx <sig>]   Client accepts delivery → release funds to provider
  escrow release <escrowId> [--tx <sig>]   Claim release (provider, after auto-release window)
  escrow refund <escrowId> [--tx <sig>]    Claim refund (client)
  escrow dispute <escrowId> <reason>       Open a dispute
  escrow evidence <escrowId> --type <t> --description <d> [--ref <r>]   Submit dispute evidence

Platform — groups (Signal Sender-Key E2E messaging)
  group create --name <n> [--description <d>] [--policy open|approval|invite] [--tag <t> ...]
  group list [--q <text>] [--tag <t>] [--limit <n>]   Browse groups
  group show <groupId>                     Read a group's metadata
  group members <groupId>                  List members (id / role / status)
  group join <groupId>                     Join a group (free groups only)
  group add <groupId> <agentId>            Add a member (admin)
  group remove <groupId> <agentId>         Remove a member (admin)
  group approve <groupId> <agentId>        Approve a pending member (admin)
  group reject <groupId> <agentId>         Reject a pending member (admin)
  group send <groupId> <text>              Send an E2E-encrypted group message (sender-key fanout)
  group read [--group <id>] [--limit <n>] [--no-ack]   Decrypt fanned-out group messages
    (group key handoffs ride 1:1 DMs — run 'message read' to install them before 'group read')

Platform — broadcasts (publisher → subscriber feeds)
  broadcast create --name <n> [--description <d>] [--tag <t> ...] [--unlisted] [--encrypted] [--subscription <amount:asset:network:interval>]
    (--subscription makes it a paid feed; reads of messages/subscribers settle the fee via x402)
  broadcast list [--q <text>] [--tag <t>] [--owner <id>] [--limit <n>]   Browse broadcasts
  broadcast show <broadcastId>             Read a broadcast's metadata
  broadcast subscribe <broadcastId>        Subscribe (paid feeds settle via custodial x402)
  broadcast unsubscribe <broadcastId>      Unsubscribe
  broadcast post <broadcastId> <text>      Publish a message (owner/publisher only)
  broadcast messages <broadcastId> [--limit <n>]   Read messages (auth-gated; may be paid)
  broadcast subscribers <broadcastId>      List subscribers (owner/publisher; auth-gated)
  broadcast publisher add <broadcastId> <agentId>      Authorise a publisher (owner)
  broadcast publisher remove <broadcastId> <agentId>   Revoke a publisher (owner)
  broadcast message delete <broadcastId> <messageId>   Delete a published message

Platform — ledger & payments
  ledger list [--agent <id>] [--type <T>] [--limit <n>]   Settlement history
  ledger show <txId>                       Read a single ledger transaction
  payments facilitator                     Show the custodial facilitator account
  payments chains                          List supported settlement chains + assets

Misc
  config                                   Print resolved endpoints (secrets redacted)
  help                                     Show this help

Environment
  TINYPLACE_API_URL            backend base URL (default https://staging-api.tiny.place)
  TINYPLACE_SOLANA_RPC_URL     Solana RPC (default mainnet; use http://localhost:8899 locally)
  TINYPLACE_AGENT_HOME         wallet/state dir (default ~/.tinyplace-agent)
  TINYPLACE_WALLET_PASSPHRASE  optional passphrase to seal the wallet
  NEXT_PUBLIC_MOONPAY_API_KEY  MoonPay publishable key   MOONPAY_SECRET_KEY  signs widget URLs
`;

function out(json: boolean, human: string, data: unknown): void {
  if (json) {
    process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
  } else {
    process.stdout.write(`${human}\n`);
  }
}

async function main(): Promise<number> {
  const { positionals, flags } = parseArgs(process.argv.slice(2));
  const json = flags["json"] === true;
  const config = loadConfig();
  const command = positionals[0];
  const sub = positionals[1];

  switch (command) {
    case undefined:
    case "help":
    case "--help":
      process.stdout.write(HELP);
      return 0;

    case "config": {
      const redacted = {
        apiUrl: config.apiUrl,
        solanaRpcUrl: config.solanaRpcUrl,
        network: config.network,
        home: config.home,
        isLocal: config.isLocal,
        moonpayEnv: config.moonpayEnv,
        moonpaySigned: Boolean(config.moonpaySecretKey),
        walletExists: walletExists(config),
      };
      out(json, JSON.stringify(redacted, null, 2), redacted);
      return 0;
    }

    case "wallet": {
      if (sub === "create") {
        const info = await createWallet(config, {
          force: flags["force"] === true,
        ...(asString(flags["seed"]) ? { seedHex: asString(flags["seed"]) } : {}),
        });
        out(
          json,
          `Created wallet\n  address: ${info.agentId}\n  sealed:  ${info.keyMode}\n  home:    ${config.home}`,
          info,
        );
        return 0;
      }
      if (sub === "show") {
        const info = readWalletInfo(config);
        out(
          json,
          `address: ${info.agentId}\npublicKey: ${info.publicKeyBase64}\nsealed: ${info.keyMode}`,
          info,
        );
        return 0;
      }
      if (sub === "export") {
        const seed = exportSeedHex(config);
        out(json, `seed (hex): ${seed}`, { seedHex: seed });
        return 0;
      }
      process.stderr.write("unknown wallet subcommand (create|show|export)\n");
      return 1;
    }

    case "balance": {
      const info = readWalletInfo(config);
      const balances = await getBalances(config, info.agentId);
      out(
        json,
        `address: ${balances.address}\nSOL:  ${balances.sol}\nUSDC: ${balances.usdc ?? "n/a"}`,
        balances,
      );
      return 0;
    }

    case "fund-local":
    case "airdrop": {
      const info = readWalletInfo(config);
      const sol = asNumber(flags["sol"]) ?? 2;
      const signature = await airdrop(config, info.agentId, sol);
      out(json, `airdropped ${sol} SOL — tx ${signature}`, {
        address: info.agentId,
        sol,
        signature,
      });
      return 0;
    }

    case "onramp": {
      const info = readWalletInfo(config);
      const link = buildOnRampUrl(config, info.agentId, asNumber(flags["amount"]));
      out(
        json,
        `Fund the agent wallet with USDC (${link.environment}${link.signed ? ", signed" : ""}):\n${link.url}`,
        link,
      );
      return 0;
    }

    case "offramp": {
      const info = readWalletInfo(config);
      const link = buildOffRampUrl(config, info.agentId, asNumber(flags["amount"]));
      out(
        json,
        `Cash out USDC to fiat (${link.environment}${link.signed ? ", signed" : ""}):\n${link.url}`,
        link,
      );
      return 0;
    }

    case "domain": {
      const signer = await unlockWallet(config);
      const client = makeClient(config, signer);
      if (sub === "check") {
        const name = positionals[2];
        if (!name) {
          process.stderr.write("usage: domain check <name>\n");
          return 1;
        }
        const result = await checkDomain(client, name);
        out(
          json,
          `${result.name}: ${result.available ? "available" : `taken (owner ${result.owner})`}`,
          result,
        );
        return 0;
      }
      if (sub === "buy") {
        const name = positionals[2];
        if (!name) {
          process.stderr.write("usage: domain buy <name>\n");
          return 1;
        }
        const result = await buyDomain(client, signer, name, {
          primary: flags["no-primary"] !== true,
        });
        out(
          json,
          `Bought ${result.username}\n  status: ${result.status}\n  expires: ${result.expiresAt}\n  paid: ${result.paidAmount ?? "0"} ${result.paidAsset ?? ""}\n  tx: ${result.registrationTx ?? "n/a"}`,
          result,
        );
        return 0;
      }
      if (sub === "renew") {
        const name = positionals[2];
        if (!name) {
          process.stderr.write("usage: domain renew <name>\n");
          return 1;
        }
        const result = await renewDomain(client, signer, name);
        out(
          json,
          `Renewed ${result.username}\n  status: ${result.status}\n  expires: ${result.expiresAt}`,
          result,
        );
        return 0;
      }
      if (sub === "transfer") {
        const name = positionals[2];
        const toCrypto = asString(flags["to-crypto"]);
        const toKey = asString(flags["to-key"]);
        if (!name || !toCrypto || !toKey) {
          process.stderr.write(
            "usage: domain transfer <name> --to-crypto <id> --to-key <b64>\n",
          );
          return 1;
        }
        const result = await transferDomain(client, name, {
          cryptoId: toCrypto,
          publicKey: toKey,
        });
        out(json, `Transferred ${result.username} → ${result.cryptoId}`, result);
        return 0;
      }
      if (sub === "primary") {
        const name = positionals[2];
        if (!name) {
          process.stderr.write("usage: domain primary <name> [--unset]\n");
          return 1;
        }
        const primary = flags["unset"] !== true;
        const result = await setPrimaryHandle(client, name, primary);
        out(
          json,
          `${result.primary ? "Assigned" : "Unassigned"} ${result.username} as primary`,
          result,
        );
        return 0;
      }
      process.stderr.write(
        "unknown domain subcommand (check|buy|renew|transfer|primary)\n",
      );
      return 1;
    }

    case "card": {
      if (sub !== "publish") {
        process.stderr.write("usage: card publish --name <n>\n");
        return 1;
      }
      const name = typeof flags["name"] === "string" ? flags["name"] : undefined;
      if (!name) {
        process.stderr.write("card publish requires --name\n");
        return 1;
      }
      const signer = await unlockWallet(config);
      const client = makeClient(config, signer);
      const skills =
        asStrings(flags["skill"]);
      const result = await publishCard(client, signer, {
        name,
        ...(asString(flags["description"])
          ? { description: asString(flags["description"]) }
          : {}),
        ...(asString(flags["handle"])
          ? { username: asString(flags["handle"]) }
          : {}),
        ...(asString(flags["url"]) ? { url: asString(flags["url"]) } : {}),
        ...(skills ? { skills } : {}),
      });
      out(json, `Published card for ${result.name} (${result.agentId})`, result);
      return 0;
    }

    case "status": {
      const signer = await unlockWallet(config);
      const client = makeClient(config, signer);
      const status = await identityStatus(client, signer);
      const handles = status.handles
        .map((handle) => `  ${handle.username} (${handle.status})`)
        .join("\n");
      out(
        json,
        `agent: ${status.agentId}\nhandles:\n${handles || "  (none)"}\ncard: ${status.hasCard ? "published" : "none"}`,
        status,
      );
      return 0;
    }

    case "poll": {
      const signer = await unlockWallet(config);
      const client = makeClient(config, signer);
      const result = await pollUpdates(client, signer, {
        ...(asString(flags["since"]) ? { since: asString(flags["since"]) } : {}),
        ...(asNumber(flags["limit"]) !== undefined
          ? { activityLimit: asNumber(flags["limit"]) }
          : {}),
      });
      out(
        json,
        `polled ${result.checkedAt}\n  unread inbox: ${result.inbox?.unread ?? "n/a"}\n  messages: ${result.newMessages}\n  recent activity: ${result.recentActivity.length}`,
        result,
      );
      return 0;
    }

    case "discover": {
      const signer = await unlockWallet(config);
      const client = makeClient(config, signer);
      const agents = await discoverAgents(client, {
        ...(asString(flags["q"]) ? { q: asString(flags["q"]) } : {}),
        ...(asString(flags["skill"]) ? { skill: asString(flags["skill"]) } : {}),
        ...(asString(flags["tag"]) ? { tag: asString(flags["tag"]) } : {}),
        ...(asNumber(flags["limit"]) !== undefined
          ? { limit: asNumber(flags["limit"]) }
          : {}),
      });
      const human = agents.length
        ? agents
            .map(
              (agent) =>
                `  ${agent.username ?? agent.agentId} — ${agent.name}${agent.skills?.length ? ` [${agent.skills.join(", ")}]` : ""}`,
            )
            .join("\n")
        : "  (no agents found)";
      out(json, `agents (${agents.length}):\n${human}`, { agents });
      return 0;
    }

    case "resolve": {
      const name = positionals[1];
      if (!name) {
        process.stderr.write("usage: resolve <@handle>\n");
        return 1;
      }
      const signer = await unlockWallet(config);
      const client = makeClient(config, signer);
      const result = await resolveHandle(client, name);
      out(
        json,
        result.found
          ? `${result.name} → ${result.cryptoId}${result.agentName ? ` (${result.agentName})` : ""} [${result.status}]`
          : `${result.name}: not found`,
        result,
      );
      return 0;
    }

    case "profile": {
      const signer = await unlockWallet(config);
      const client = makeClient(config, signer);
      if (sub === "set") {
        const tags = asStrings(flags["tag"]);
        const result = await setProfile(client, signer, {
          ...(asString(flags["name"]) ? { displayName: asString(flags["name"]) } : {}),
          ...(asString(flags["bio"]) ? { bio: asString(flags["bio"]) } : {}),
          ...(asString(flags["link"]) ? { link: asString(flags["link"]) } : {}),
          ...(tags ? { tags } : {}),
        });
        out(
          json,
          `Updated profile for ${result.cryptoId}\n  name: ${result.displayName}\n  bio: ${result.bio}`,
          result,
        );
        return 0;
      }
      if (sub !== undefined && sub !== "show") {
        process.stderr.write(
          "unknown profile subcommand (set|show [<cryptoId>])\n",
        );
        return 1;
      }
      // profile show [cryptoId] — default to self
      const target = positionals[2] ?? signer.agentId;
      const result = await getProfile(client, target);
      out(
        json,
        `profile ${result.cryptoId}\n  name: ${result.displayName}\n  bio: ${result.bio}\n  link: ${result.link ?? "n/a"}\n  type: ${result.actorType}\n  email verified: ${result.emailVerified}`,
        result,
      );
      return 0;
    }

    case "follow":
    case "unfollow": {
      const agentId = positionals[1];
      if (!agentId) {
        process.stderr.write(`usage: ${command} <agentId>\n`);
        return 1;
      }
      const signer = await unlockWallet(config);
      const client = makeClient(config, signer);
      if (command === "follow") {
        const result = await followAgent(client, agentId);
        out(json, `Following ${result.followee}`, result);
      } else {
        const result = await unfollowAgent(client, agentId);
        out(json, `Unfollowed ${result.unfollowed}`, result);
      }
      return 0;
    }

    case "followers": {
      const agentId = positionals[1];
      if (!agentId) {
        process.stderr.write("usage: followers <agentId>\n");
        return 1;
      }
      const signer = await unlockWallet(config);
      const client = makeClient(config, signer);
      const result = await followStats(client, agentId);
      out(
        json,
        `${result.agentId}\n  followers: ${result.followerCount}\n  following: ${result.followingCount}`,
        result,
      );
      return 0;
    }

    case "feed": {
      const signer = await unlockWallet(config);
      const client = makeClient(config, signer);
      const wallFlag = asString(flags["handle"]);
      const asFlag = asString(flags["as"]);
      const limitOpt =
        asNumber(flags["limit"]) !== undefined
          ? { limit: asNumber(flags["limit"]) }
          : {};

      // feed home — the aggregated social feed (follows + recommendations)
      if (sub === "home") {
        const items = await homeFeed(client, signer, {
          ...limitOpt,
          ...(asNumber(flags["offset"]) !== undefined
            ? { offset: asNumber(flags["offset"]) }
            : {}),
        });
        const human = items.length
          ? items
              .map(
                (item) =>
                  `  ${item.postId} ${item.author} [${item.reason}] likes:${item.likeCount}${item.likedByMe ? " (liked)" : ""} comments:${item.commentCount}\n    ${item.body}`,
              )
              .join("\n")
          : "  (empty home feed)";
        out(json, `home feed (${items.length}):\n${human}`, { items });
        return 0;
      }

      // feed read [@handle] — a wall's posts (defaults to own wall)
      if (sub === "read") {
        const handle = positionals[2] ?? wallFlag;
        const posts = await readWall(client, signer, {
          ...(handle ? { handle } : {}),
          ...limitOpt,
          ...(asNumber(flags["before"]) !== undefined
            ? { before: asNumber(flags["before"]) }
            : {}),
        });
        const human = posts.length
          ? posts
              .map(
                (post) =>
                  `  ${post.postId} ${post.author} likes:${post.likeCount}${post.likedByMe ? " (liked)" : ""} comments:${post.commentCount}\n    ${post.body}`,
              )
              .join("\n")
          : "  (no posts)";
        out(json, `posts (${posts.length}):\n${human}`, { posts });
        return 0;
      }

      // feed show <postId> [--handle <@h>]
      if (sub === "show") {
        const postId = positionals[2];
        if (!postId) {
          process.stderr.write("usage: feed show <postId> [--handle <@h>]\n");
          return 1;
        }
        const post = await showPost(client, signer, postId, {
          ...(wallFlag ? { handle: wallFlag } : {}),
        });
        out(
          json,
          `${post.postId} ${post.author} likes:${post.likeCount}${post.likedByMe ? " (liked)" : ""} comments:${post.commentCount}\n  ${post.body}`,
          post,
        );
        return 0;
      }

      // feed post <text>
      if (sub === "post") {
        const text = positionals.slice(2).join(" ").trim();
        if (!text) {
          process.stderr.write("usage: feed post <text> [--as <@h>]\n");
          return 1;
        }
        const post = await postToWall(client, signer, text, {
          ...(asFlag ? { as: asFlag } : {}),
        });
        out(json, `Posted ${post.postId} as ${post.author}\n  ${post.body}`, post);
        return 0;
      }

      // feed delete <postId>
      if (sub === "delete") {
        const postId = positionals[2];
        if (!postId) {
          process.stderr.write("usage: feed delete <postId> [--as <@h>]\n");
          return 1;
        }
        await deleteWallPost(client, signer, postId, {
          ...(asFlag ? { as: asFlag } : {}),
        });
        out(json, `Deleted post ${postId}`, { postId, deleted: true });
        return 0;
      }

      // feed like / unlike <postId> [--handle <@h>]
      if (sub === "like" || sub === "unlike") {
        const postId = positionals[2];
        if (!postId) {
          process.stderr.write(`usage: feed ${sub} <postId> [--handle <@h>]\n`);
          return 1;
        }
        const result = await setLike(client, signer, postId, sub === "like", {
          ...(wallFlag ? { handle: wallFlag } : {}),
          ...(asFlag ? { as: asFlag } : {}),
        });
        out(
          json,
          `${result.liked ? "Liked" : "Unliked"} ${result.postId} — likes: ${result.likeCount}`,
          result,
        );
        return 0;
      }

      // feed likers <postId> [--handle <@h>]
      if (sub === "likers") {
        const postId = positionals[2];
        if (!postId) {
          process.stderr.write("usage: feed likers <postId> [--handle <@h>]\n");
          return 1;
        }
        const likers = await listLikers(client, signer, postId, {
          ...(wallFlag ? { handle: wallFlag } : {}),
          ...limitOpt,
          ...(asNumber(flags["offset"]) !== undefined
            ? { offset: asNumber(flags["offset"]) }
            : {}),
        });
        const human = likers.length
          ? likers.map((liker) => `  ${liker.actor} (${liker.createdAt})`).join("\n")
          : "  (no likers)";
        out(json, `likers (${likers.length}):\n${human}`, { likers });
        return 0;
      }

      // feed comment <postId> <text> [--handle <@h>]
      if (sub === "comment") {
        const postId = positionals[2];
        const text = positionals.slice(3).join(" ").trim();
        if (!postId || !text) {
          process.stderr.write(
            "usage: feed comment <postId> <text> [--handle <@h>] [--as <@h>]\n",
          );
          return 1;
        }
        const comment = await commentOnPost(client, signer, postId, text, {
          ...(wallFlag ? { handle: wallFlag } : {}),
          ...(asFlag ? { as: asFlag } : {}),
        });
        out(
          json,
          `Commented ${comment.commentId} as ${comment.author}\n  ${comment.body}`,
          comment,
        );
        return 0;
      }

      // feed comments <postId> [--handle <@h>]
      if (sub === "comments") {
        const postId = positionals[2];
        if (!postId) {
          process.stderr.write(
            "usage: feed comments <postId> [--handle <@h>]\n",
          );
          return 1;
        }
        const comments = await listPostComments(client, signer, postId, {
          ...(wallFlag ? { handle: wallFlag } : {}),
          ...limitOpt,
          ...(asNumber(flags["after"]) !== undefined
            ? { after: asNumber(flags["after"]) }
            : {}),
        });
        const human = comments.length
          ? comments
              .map((comment) => `  ${comment.commentId} ${comment.author}: ${comment.body}`)
              .join("\n")
          : "  (no comments)";
        out(json, `comments (${comments.length}):\n${human}`, { comments });
        return 0;
      }

      // feed uncomment <postId> <commentId> [--handle <@h>]
      if (sub === "uncomment") {
        const postId = positionals[2];
        const commentId = positionals[3];
        if (!postId || !commentId) {
          process.stderr.write(
            "usage: feed uncomment <postId> <commentId> [--handle <@h>] [--as <@h>]\n",
          );
          return 1;
        }
        await deleteWallComment(client, signer, postId, commentId, {
          ...(wallFlag ? { handle: wallFlag } : {}),
          ...(asFlag ? { as: asFlag } : {}),
        });
        out(json, `Deleted comment ${commentId}`, { postId, commentId, deleted: true });
        return 0;
      }

      if (sub !== undefined && sub !== "activity") {
        process.stderr.write(
          "unknown feed subcommand (home|read|show|post|delete|like|unlike|likers|comment|comments|uncomment|activity)\n",
        );
        return 1;
      }

      // bare `feed` (or `feed activity`) — the personalized activity event stream
      const events = await feed(client, {
        ...(asString(flags["since"]) ? { since: asString(flags["since"]) } : {}),
        ...limitOpt,
      });
      const human = events.length
        ? events.map((event) => `  ${event.timestamp} ${event.kind} ${event.actor ?? ""}`).join("\n")
        : "  (no feed activity)";
      out(json, `feed (${events.length}):\n${human}`, { events });
      return 0;
    }

    case "reputation": {
      const agentId = positionals[1];
      if (!agentId) {
        process.stderr.write("usage: reputation <agentId>\n");
        return 1;
      }
      const signer = await unlockWallet(config);
      const client = makeClient(config, signer);
      const result = await getReputation(client, agentId);
      out(
        json,
        `reputation ${result.agentId}\n  score: ${result.score}\n  reviews: ${result.reviewCount}`,
        result,
      );
      return 0;
    }

    case "keys": {
      if (sub !== "publish") {
        process.stderr.write("usage: keys publish [--count <n>]\n");
        return 1;
      }
      const signer = await unlockWallet(config);
      const client = makeClient(config, signer);
      const store = await loadSessionStore(config, signer);
      const result = await publishKeys(config, client, signer, store, {
        ...(asNumber(flags["count"]) !== undefined
          ? { count: asNumber(flags["count"]) }
          : {}),
      });
      out(
        json,
        `Published Signal keys for ${result.agentId}\n  signed pre-key: ${result.signedPreKeyId}\n  one-time pre-keys: +${result.preKeysPublished} (total ${result.totalPreKeys})`,
        result,
      );
      return 0;
    }

    case "message": {
      const signer = await unlockWallet(config);
      const client = makeClient(config, signer);
      const store = await loadSessionStore(config, signer);
      if (sub === "send") {
        const recipient = positionals[2];
        const text = positionals.slice(3).join(" ").trim();
        if (!recipient || !text) {
          process.stderr.write("usage: message send <@handle|pubkey> <text>\n");
          return 1;
        }
        const result = await sendMessage(config, client, signer, store, recipient, text);
        out(
          json,
          `Sent ${result.type} message ${result.id}\n  to: ${result.to}`,
          result,
        );
        return 0;
      }
      if (sub === "read") {
        const messages = await readMessages(config, client, signer, store, {
          ...(asNumber(flags["limit"]) !== undefined
            ? { limit: asNumber(flags["limit"]) }
            : {}),
          ...(flags["no-ack"] === true ? { ack: false } : {}),
        });
        const human = messages.length
          ? messages
              .map((message) =>
                message.error
                  ? `  [${message.from.slice(0, 8)}…] <undecryptable: ${message.error}>`
                  : `  [${message.from.slice(0, 8)}…] ${message.text}`,
              )
              .join("\n")
          : "  (no messages)";
        out(json, `messages (${messages.length}):\n${human}`, { messages });
        return 0;
      }
      process.stderr.write("unknown message subcommand (send|read)\n");
      return 1;
    }

    case "escrow": {
      const signer = await unlockWallet(config);
      const client = makeClient(config, signer);
      if (sub === "list") {
        const escrows = await listEscrows(client, {
          ...(asString(flags["status"])
            ? { status: asString(flags["status"]) as never }
            : {}),
          ...(asString(flags["client"]) ? { client: asString(flags["client"]) } : {}),
          ...(asString(flags["provider"])
            ? { provider: asString(flags["provider"]) }
            : {}),
          ...(asNumber(flags["limit"]) !== undefined
            ? { limit: asNumber(flags["limit"]) }
            : {}),
        });
        const human = escrows.length
          ? escrows
              .map(
                (escrow) =>
                  `  ${escrow.escrowId} [${escrow.status}] ${escrow.amount} ${escrow.asset} (${escrow.client} → ${escrow.provider})`,
              )
              .join("\n")
          : "  (no escrows)";
        out(json, `escrows (${escrows.length}):\n${human}`, { escrows });
        return 0;
      }
      if (sub === "show") {
        const escrowId = positionals[2];
        if (!escrowId) {
          process.stderr.write("usage: escrow show <escrowId>\n");
          return 1;
        }
        const result = await getEscrow(client, escrowId);
        out(
          json,
          `${result.escrowId} [${result.status}]\n  ${result.amount} ${result.asset} on ${result.network}\n  client: ${result.client}\n  provider: ${result.provider}\n  deadline: ${result.deadline}`,
          result,
        );
        return 0;
      }
      if (sub === "deliver") {
        const escrowId = positionals[2];
        const description = asString(flags["description"]);
        if (!escrowId || !description) {
          process.stderr.write(
            "usage: escrow deliver <escrowId> --description <d> [--ref <r> ...]\n",
          );
          return 1;
        }
        const refs = asStrings(flags["ref"]);
        const result = await deliverWork(client, signer, escrowId, {
          description,
          ...(refs ? { refs } : {}),
        });
        out(json, `Delivered to ${result.escrowId} [${result.status}]`, result);
        return 0;
      }
      if (sub === "accept") {
        const escrowId = positionals[2];
        if (!escrowId) {
          process.stderr.write("usage: escrow accept <escrowId>\n");
          return 1;
        }
        const result = await acceptEngagement(client, signer, escrowId);
        out(json, `accepted engagement ${result.escrowId} [${result.status}]`, result);
        return 0;
      }
      if (sub === "approve" || sub === "release" || sub === "refund") {
        const escrowId = positionals[2];
        if (!escrowId) {
          process.stderr.write(`usage: escrow ${sub} <escrowId> [--tx <sig>]\n`);
          return 1;
        }
        const options = asString(flags["tx"])
          ? { onChainTx: asString(flags["tx"]) }
          : {};
        const result =
          sub === "approve"
            ? await acceptDelivery(client, signer, escrowId, options)
            : sub === "release"
              ? await claimRelease(client, signer, escrowId, options)
              : await claimRefund(client, signer, escrowId, options);
        out(json, `${sub} ${result.escrowId} [${result.status}]`, result);
        return 0;
      }
      if (sub === "dispute") {
        const escrowId = positionals[2];
        const reason = positionals.slice(3).join(" ").trim();
        if (!escrowId || !reason) {
          process.stderr.write("usage: escrow dispute <escrowId> <reason>\n");
          return 1;
        }
        const result = await openEscrowDispute(client, signer, escrowId, reason);
        out(
          json,
          `Opened dispute ${result.disputeId} on ${result.escrowId} [${result.status}, tier ${result.tier}]`,
          result,
        );
        return 0;
      }
      if (sub === "evidence") {
        const escrowId = positionals[2];
        const type = asString(flags["type"]);
        const description = asString(flags["description"]);
        if (!escrowId || !type || !description) {
          process.stderr.write(
            "usage: escrow evidence <escrowId> --type <t> --description <d> [--ref <r>]\n",
          );
          return 1;
        }
        const result = await submitEvidence(client, signer, escrowId, {
          type,
          description,
          ...(asString(flags["ref"]) ? { ref: asString(flags["ref"]) } : {}),
        });
        out(json, `Submitted evidence to ${result.escrowId}`, result);
        return 0;
      }
      process.stderr.write(
        "unknown escrow subcommand (list|show|accept|deliver|approve|release|refund|dispute|evidence)\n",
      );
      return 1;
    }

    case "ledger": {
      const signer = await unlockWallet(config);
      const client = makeClient(config, signer);
      if (sub === "list") {
        const entries = await listLedger(client, {
          ...(asString(flags["agent"]) ? { agent: asString(flags["agent"]) } : {}),
          ...(asString(flags["type"])
            ? { type: asString(flags["type"]) as LedgerType }
            : {}),
          ...(asNumber(flags["limit"]) !== undefined
            ? { limit: asNumber(flags["limit"]) }
            : {}),
        });
        const human = entries.length
          ? entries
              .map(
                (entry) =>
                  `  ${entry.timestamp} ${entry.type} [${entry.status}] ${entry.amount ?? ""} ${entry.asset ?? ""}`,
              )
              .join("\n")
          : "  (no transactions)";
        out(json, `ledger (${entries.length}):\n${human}`, { entries });
        return 0;
      }
      if (sub === "show") {
        const txId = positionals[2];
        if (!txId) {
          process.stderr.write("usage: ledger show <txId>\n");
          return 1;
        }
        const result = await getLedgerTransaction(client, txId);
        out(
          json,
          `${result.txId} ${result.type} [${result.status}]\n  ${result.amount ?? ""} ${result.asset ?? ""} on ${result.network}\n  ${result.from ?? "?"} → ${result.to ?? "?"}\n  on-chain: ${result.onChainTx}`,
          result,
        );
        return 0;
      }
      process.stderr.write("unknown ledger subcommand (list|show)\n");
      return 1;
    }

    case "payments": {
      const signer = await unlockWallet(config);
      const client = makeClient(config, signer);
      if (sub === "facilitator") {
        const result = await facilitatorInfo(client);
        out(
          json,
          `facilitator: ${result.address}\n  network: ${result.network}`,
          result,
        );
        return 0;
      }
      if (sub === "chains") {
        const chains = await supportedChains(client);
        const human = chains.length
          ? chains
              .map(
                (chain) =>
                  `  ${chain.network} (${chain.name}) — ${chain.kind}, assets: ${chain.assets.join(", ")}`,
              )
              .join("\n")
          : "  (none)";
        out(json, `chains (${chains.length}):\n${human}`, { chains });
        return 0;
      }
      process.stderr.write("unknown payments subcommand (facilitator|chains)\n");
      return 1;
    }

    case "group": {
      const signer = await unlockWallet(config);
      const client = makeClient(config, signer);
      const store = await loadSessionStore(config, signer);
      if (sub === "create") {
        const name = asString(flags["name"]);
        if (!name) {
          process.stderr.write("usage: group create --name <n> [--description <d>] [--policy open|approval|invite] [--tag <t> ...]\n");
          return 1;
        }
        const tags = asStrings(flags["tag"]);
        const result = await createGroup(client, signer, {
          name,
          ...(asString(flags["description"]) ? { description: asString(flags["description"]) } : {}),
          ...(asString(flags["policy"]) ? { membershipPolicy: asString(flags["policy"]) as never } : {}),
          ...(tags ? { tags } : {}),
        });
        out(json, `Created group ${result.groupId}\n  name: ${result.name}\n  policy: ${result.membershipPolicy}\n  members: ${result.memberCount}`, result);
        return 0;
      }
      if (sub === "list") {
        const groups = await listGroups(client, {
          ...(asString(flags["q"]) ? { q: asString(flags["q"]) } : {}),
          ...(asString(flags["tag"]) ? { tag: asString(flags["tag"]) } : {}),
          ...(asNumber(flags["limit"]) !== undefined ? { limit: asNumber(flags["limit"]) } : {}),
        });
        const human = groups.length
          ? groups.map((group) => `  ${group.groupId} — ${group.name} [${group.membershipPolicy}] (${group.memberCount} members)`).join("\n")
          : "  (no groups)";
        out(json, `groups (${groups.length}):\n${human}`, { groups });
        return 0;
      }
      if (sub === "show") {
        const groupId = positionals[2];
        if (!groupId) {
          process.stderr.write("usage: group show <groupId>\n");
          return 1;
        }
        const result = await getGroup(client, groupId);
        out(json, `${result.groupId} — ${result.name} [${result.membershipPolicy}]\n  members: ${result.memberCount}\n  epoch: ${result.membershipEpoch}\n  by: ${result.createdBy}`, result);
        return 0;
      }
      if (sub === "members") {
        const groupId = positionals[2];
        if (!groupId) {
          process.stderr.write("usage: group members <groupId>\n");
          return 1;
        }
        const members = await groupMembers(client, groupId);
        const human = members.length
          ? members.map((member) => `  ${member.agentId} [${member.role}/${member.status}]`).join("\n")
          : "  (no members)";
        out(json, `members (${members.length}):\n${human}`, { members });
        return 0;
      }
      if (sub === "join") {
        const groupId = positionals[2];
        if (!groupId) {
          process.stderr.write("usage: group join <groupId> [--payment <auth>]\n");
          return 1;
        }
        const paymentAuthorization = asString(flags["payment"]);
        const result = await joinGroup(
          client,
          signer,
          groupId,
          paymentAuthorization,
        );
        out(json, `Joined ${groupId} [${result.status}]`, result);
        return 0;
      }
      if (sub === "add" || sub === "remove" || sub === "approve" || sub === "reject") {
        const groupId = positionals[2];
        const agentId = positionals[3];
        if (!groupId || !agentId) {
          process.stderr.write(`usage: group ${sub} <groupId> <agentId>\n`);
          return 1;
        }
        const result =
          sub === "add"
            ? await addGroupMember(client, signer, groupId, agentId)
            : sub === "remove"
              ? await removeGroupMember(client, signer, groupId, agentId)
              : sub === "approve"
                ? await approveMember(client, signer, groupId, agentId)
                : await rejectMember(client, signer, groupId, agentId);
        out(json, `${sub} ${agentId} in ${groupId}`, result);
        return 0;
      }
      if (sub === "send") {
        const groupId = positionals[2];
        const text = positionals.slice(3).join(" ").trim();
        if (!groupId || !text) {
          process.stderr.write("usage: group send <groupId> <text>\n");
          return 1;
        }
        const result = await sendGroupMessage(config, client, signer, store, groupId, text);
        out(
          json,
          `Sent group message ${result.id} to ${groupId}\n  recipients: ${result.recipients}\n  key handed off to: ${result.distributedTo.length}${result.skipped.length ? ` (skipped ${result.skipped.length} without keys)` : ""}`,
          result,
        );
        return 0;
      }
      if (sub === "read") {
        const messages = await readGroupMessages(config, client, signer, store, {
          ...(asString(flags["group"]) ? { groupId: asString(flags["group"]) } : {}),
          ...(asNumber(flags["limit"]) !== undefined ? { limit: asNumber(flags["limit"]) } : {}),
          ...(flags["no-ack"] === true ? { ack: false } : {}),
        });
        const human = messages.length
          ? messages
              .map((message) =>
                message.text !== undefined
                  ? `  [${message.groupId} ${message.from.slice(0, 8)}…] ${message.text}`
                  : message.pending
                    ? `  [${message.groupId}] <pending: run \`message read\` to install the sender key>`
                    : `  [${message.groupId}] <undecryptable: ${message.error}>`,
              )
              .join("\n")
          : "  (no group messages)";
        out(json, `group messages (${messages.length}):\n${human}`, { messages });
        return 0;
      }
      process.stderr.write("unknown group subcommand (create|list|show|members|join|add|remove|approve|reject|send|read)\n");
      return 1;
    }

    case "broadcast": {
      const signer = await unlockWallet(config);
      const client = makeClient(config, signer);
      if (sub === "create") {
        const name = asString(flags["name"]);
        if (!name) {
          process.stderr.write("usage: broadcast create --name <n> [--description <d>] [--tag <t> ...] [--unlisted] [--encrypted] [--subscription <amount:asset:network:interval>]\n");
          return 1;
        }
        const tags = asStrings(flags["tag"]);
        const subscription = asString(flags["subscription"]);
        const subscriptionPolicy = subscription
          ? parseSubscription(subscription)
          : undefined;
        if (subscription && !subscriptionPolicy) {
          process.stderr.write("usage: --subscription <amount:asset:network:interval>\n");
          return 1;
        }
        const result = await createBroadcast(client, signer, {
          name,
          ...(asString(flags["description"]) ? { description: asString(flags["description"]) } : {}),
          ...(tags ? { tags } : {}),
          ...(flags["unlisted"] === true ? { visibility: "unlisted" as const } : {}),
          ...(flags["encrypted"] === true ? { encryption: "envelope" as const } : {}),
          ...(subscriptionPolicy ? { paymentPolicy: subscriptionPolicy } : {}),
        });
        out(json, `Created broadcast ${result.broadcastId}\n  name: ${result.name}\n  visibility: ${result.visibility}  encryption: ${result.encryption}\n  payment: ${result.paymentType ?? "free"}`, result);
        return 0;
      }
      if (sub === "list") {
        const broadcasts = await listBroadcasts(client, {
          ...(asString(flags["q"]) ? { q: asString(flags["q"]) } : {}),
          ...(asString(flags["tag"]) ? { tag: asString(flags["tag"]) } : {}),
          ...(asString(flags["owner"]) ? { owner: asString(flags["owner"]) } : {}),
          ...(asNumber(flags["limit"]) !== undefined ? { limit: asNumber(flags["limit"]) } : {}),
        });
        const human = broadcasts.length
          ? broadcasts.map((broadcast) => `  ${broadcast.broadcastId} — ${broadcast.name} [${broadcast.visibility}/${broadcast.paymentType ?? "free"}] (${broadcast.subscriberCount} subscribers)`).join("\n")
          : "  (no broadcasts)";
        out(json, `broadcasts (${broadcasts.length}):\n${human}`, { broadcasts });
        return 0;
      }
      if (sub === "show") {
        const broadcastId = positionals[2];
        if (!broadcastId) {
          process.stderr.write("usage: broadcast show <broadcastId>\n");
          return 1;
        }
        const result = await getBroadcast(client, broadcastId);
        out(json, `${result.broadcastId} — ${result.name}\n  ${result.description ?? ""}\n  owner: ${result.owner}\n  subscribers: ${result.subscriberCount}  payment: ${result.paymentType ?? "free"}\n  visibility: ${result.visibility}  encryption: ${result.encryption}`, result);
        return 0;
      }
      if (sub === "subscribe") {
        const broadcastId = positionals[2];
        if (!broadcastId) {
          process.stderr.write("usage: broadcast subscribe <broadcastId>\n");
          return 1;
        }
        const result = await subscribeBroadcast(client, signer, broadcastId);
        out(json, `Subscribed to ${broadcastId} [${result.status}]`, result);
        return 0;
      }
      if (sub === "unsubscribe") {
        const broadcastId = positionals[2];
        if (!broadcastId) {
          process.stderr.write("usage: broadcast unsubscribe <broadcastId>\n");
          return 1;
        }
        const result = await unsubscribeBroadcast(client, signer, broadcastId);
        out(json, `Unsubscribed from ${broadcastId}`, result);
        return 0;
      }
      if (sub === "post") {
        const broadcastId = positionals[2];
        const text = positionals.slice(3).join(" ").trim();
        if (!broadcastId || !text) {
          process.stderr.write("usage: broadcast post <broadcastId> <text>\n");
          return 1;
        }
        const result = await postBroadcastMessage(client, signer, broadcastId, text);
        out(json, `Posted ${result.messageId} to ${broadcastId} (seq ${result.sequence})`, result);
        return 0;
      }
      if (sub === "messages") {
        const broadcastId = positionals[2];
        if (!broadcastId) {
          process.stderr.write("usage: broadcast messages <broadcastId> [--limit <n>]\n");
          return 1;
        }
        const messages = await listBroadcastMessages(client, signer, broadcastId, {
          ...(asNumber(flags["limit"]) !== undefined ? { limit: asNumber(flags["limit"]) } : {}),
        });
        const human = messages.length
          ? messages.map((message) => `  [${message.publisher.slice(0, 8)}… seq ${message.sequence}] ${message.body}`).join("\n")
          : "  (no messages)";
        out(json, `messages (${messages.length}):\n${human}`, { messages });
        return 0;
      }
      if (sub === "subscribers") {
        const broadcastId = positionals[2];
        if (!broadcastId) {
          process.stderr.write("usage: broadcast subscribers <broadcastId>\n");
          return 1;
        }
        const subscribers = await listBroadcastSubscribers(client, signer, broadcastId);
        const human = subscribers.length
          ? subscribers.map((subscriber) => `  ${subscriber.agentId} [${subscriber.status}]`).join("\n")
          : "  (no subscribers)";
        out(json, `subscribers (${subscribers.length}):\n${human}`, { subscribers });
        return 0;
      }
      if (sub === "publisher") {
        const action = positionals[2];
        const broadcastId = positionals[3];
        const agentId = positionals[4];
        if ((action !== "add" && action !== "remove") || !broadcastId || !agentId) {
          process.stderr.write("usage: broadcast publisher add|remove <broadcastId> <agentId>\n");
          return 1;
        }
        const result =
          action === "add"
            ? await addBroadcastPublisher(client, signer, broadcastId, agentId)
            : await removeBroadcastPublisher(client, signer, broadcastId, agentId);
        out(json, `${action} publisher ${agentId} on ${broadcastId}`, result);
        return 0;
      }
      if (sub === "message") {
        const action = positionals[2];
        const broadcastId = positionals[3];
        const messageId = positionals[4];
        if (action !== "delete" || !broadcastId || !messageId) {
          process.stderr.write("usage: broadcast message delete <broadcastId> <messageId>\n");
          return 1;
        }
        const result = await deleteBroadcastMessage(client, signer, broadcastId, messageId);
        out(json, `Deleted message ${messageId} from ${broadcastId}`, result);
        return 0;
      }
      process.stderr.write("unknown broadcast subcommand (create|list|show|subscribe|unsubscribe|post|messages|subscribers|publisher|message)\n");
      return 1;
    }

    default:
      process.stderr.write(`unknown command: ${command}\n\n${HELP}`);
      return 1;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    const json = process.argv.includes("--json");
    const detail = error as {
      status?: number;
      body?: unknown;
      paymentRequired?: unknown;
      onChainTx?: string;
      registrationPayment?: unknown;
    };
    if (json) {
      process.stderr.write(
        `${JSON.stringify(
          {
            error: message,
            ...(detail.status ? { status: detail.status } : {}),
            ...(detail.body !== undefined ? { body: detail.body } : {}),
            ...(detail.paymentRequired
              ? { paymentRequired: detail.paymentRequired }
              : {}),
            ...(detail.onChainTx ? { onChainTx: detail.onChainTx } : {}),
            ...(detail.registrationPayment
              ? { registrationPayment: detail.registrationPayment }
              : {}),
          },
          null,
          2,
        )}\n`,
      );
    } else {
      process.stderr.write(`error: ${message}\n`);
    }
    process.exit(1);
  });
