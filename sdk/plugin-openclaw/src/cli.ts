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
  airdrop,
  buildOffRampUrl,
  buildOnRampUrl,
  buyDomain,
  checkDomain,
  createWallet,
  exportSeedHex,
  getBalances,
  identityStatus,
  loadConfig,
  makeClient,
  pollUpdates,
  publishCard,
  readWalletInfo,
  unlockWallet,
  walletExists,
} from "./index.js";

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

Platform
  domain check <name>                      Check if a @handle is available
  domain buy <name> [--no-primary]         Buy (register) a @handle via custodial x402
  card publish --name <n> [--description <d>] [--handle <@h>] [--skill <s> ...] [--url <u>]
  status                                   Show owned handles + directory card
  poll [--since <iso>] [--limit <n>]       Poll inbox / messages / activity for updates

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
      process.stderr.write("unknown domain subcommand (check|buy)\n");
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
