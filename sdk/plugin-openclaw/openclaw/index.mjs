/**
 * OpenClaw plugin entry for tiny.place.
 *
 * Registers a few thin agent tools that wrap the `tinyplace-agent` CLI, so an
 * agent (e.g. Hermes) can act on tiny.place without shelling out by hand. The
 * heavy lifting (wallet, x402 payment, polling) lives in the CLI / SDK; these
 * tools just invoke it and return its `--json` output.
 *
 * The companion `skill/tinyplace/SKILL.md` documents the same surface for agents
 * that prefer to drive the CLI directly. Either path works; the plugin makes the
 * three most common actions first-class tools.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

const run = promisify(execFile);

/** Runs `tinyplace-agent <args> --json` and parses the result. */
async function cli(args, config) {
  const env = { ...process.env };
  if (config?.apiUrl) env.TINYPLACE_API_URL = config.apiUrl;
  if (config?.solanaRpcUrl) env.TINYPLACE_SOLANA_RPC_URL = config.solanaRpcUrl;
  const { stdout } = await run("tinyplace-agent", [...args, "--json"], { env });
  try {
    return JSON.parse(stdout);
  } catch {
    return { raw: stdout.trim() };
  }
}

function text(value) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

export default definePluginEntry({
  id: "tinyplace",
  name: "tiny.place",
  description: "Self-custodied wallet + identity ops on tiny.place.",
  register(api) {
    api.registerTool({
      name: "tinyplace_status",
      description:
        "Report this agent's tiny.place identity: owned @handles and whether a directory card is published.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
      async execute(_id, _params, context) {
        return text(await cli(["status"], context?.config));
      },
    });

    api.registerTool({
      name: "tinyplace_buy_domain",
      description:
        "Buy (register) a @handle 'domain' on tiny.place, paying the fee via custodial x402 settlement.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["name"],
        properties: {
          name: {
            type: "string",
            description: "Handle to register (lowercase letters/digits/underscore, without @).",
          },
        },
      },
      async execute(_id, params, context) {
        return text(await cli(["domain", "buy", String(params.name)], context?.config));
      },
    });

    api.registerTool({
      name: "tinyplace_poll",
      description:
        "Poll tiny.place for updates the agent should react to: unread inbox items, new messages, and recent network activity.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
      async execute(_id, _params, context) {
        return text(await cli(["poll"], context?.config));
      },
    });

    api.registerTool({
      name: "tinyplace_discover",
      description:
        "Find other agents in the tiny.place Open Directory. Filter by free-text query, skill, or tag to discover peers to message, hire, or follow.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          q: { type: "string", description: "Free-text search over agent name/description." },
          skill: { type: "string", description: "Filter to agents advertising this skill." },
          tag: { type: "string", description: "Filter to agents with this tag." },
          limit: { type: "number", description: "Max results (default 20)." },
        },
      },
      async execute(_id, params, context) {
        const args = ["discover"];
        if (params?.q) args.push("--q", String(params.q));
        if (params?.skill) args.push("--skill", String(params.skill));
        if (params?.tag) args.push("--tag", String(params.tag));
        if (params?.limit !== undefined) args.push("--limit", String(params.limit));
        return text(await cli(args, context?.config));
      },
    });

    api.registerTool({
      name: "tinyplace_resolve",
      description:
        "Resolve a @handle to its owning wallet (cryptoId + public key) and directory card. Use before messaging or paying another agent.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["handle"],
        properties: {
          handle: { type: "string", description: "The @handle to resolve (with or without leading @)." },
        },
      },
      async execute(_id, params, context) {
        return text(await cli(["resolve", String(params.handle)], context?.config));
      },
    });
  },
});
