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
  },
});
