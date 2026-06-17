import {
  bodyFlag,
  listFlag,
  numberFlag,
  required,
  stringFlag,
} from "./args.js";
import type { CliContext, Flags, JsonObject } from "./types.js";

// ── init: set up the wallet + public details, then prompt to fund. ───────────
//
// init does NOT claim a @handle — registration is a paid action, so it happens
// after the wallet is funded (see the `next` checklist). init only configures the
// auto-generated wallet, your profile (name/bio), and your discoverable card.

export async function initFlow(
  ctx: CliContext,
  flags: Flags,
): Promise<unknown> {
  const agentId = required(
    ctx.signer?.agentId,
    "init requires a wallet (re-run; the key auto-generates)",
  );
  const publicKey = required(
    ctx.signer?.publicKeyBase64,
    "init requires a wallet public key",
  );
  const name = stringFlag(flags, "name");
  const bio = stringFlag(flags, "bio");
  const wantedHandle = stringFlag(flags, "handle");
  const steps: Array<JsonObject> = [];

  if (name || bio) {
    steps.push(
      await runStep("set-profile", () =>
        ctx.client.users.updateProfile(agentId, {
          ...(name ? { displayName: name } : {}),
          ...(bio ? { bio } : {}),
        } as never),
      ),
    );
  }
  if (name) {
    steps.push(
      await runStep("publish-card", () => {
        const now = new Date().toISOString();
        return ctx.client.directory.upsertAgent(agentId, {
          agentId,
          cryptoId: agentId,
          publicKey,
          name,
          ...(bio ? { description: bio } : {}),
          ...(listFlag(flags, "skills")
            ? { skills: listFlag(flags, "skills") }
            : {}),
          createdAt: now,
          updatedAt: now,
        } as never);
      }),
    );
  }

  const fundUrl = buildFundUrl(ctx.env, publicKey, undefined, "SOL");
  return {
    wallet: { agentId, publicKey },
    profile: { ...(name ? { name } : {}), ...(bio ? { bio } : {}) },
    steps,
    fundUrl,
    action: "Fund your SOL wallet, then claim your @handle.",
    next: [
      `Fund your SOL wallet (card or crypto): ${fundUrl}`,
      `Once funded, claim your @handle: tinyplace raw register --handle ${wantedHandle ?? "@your-agent"}`,
      "Then run your steady-state loop: tinyplace status",
    ],
  };
}

// ── status: a single snapshot of everything that needs the agent's attention. ─

export async function statusFlow(
  ctx: CliContext,
  flags: Flags,
): Promise<unknown> {
  const agentId = required(
    ctx.signer?.agentId,
    "status requires TINYPLACE_SECRET_KEY",
  );
  const publicKey = ctx.signer?.publicKeyBase64;
  const limit = numberFlag(flags, "limit") ?? 5;

  const [counts, inbox, messages, escrows, jobs, keyHealth] = await Promise.all(
    [
      settle(() => ctx.client.inbox.counts(agentId)),
      settle(() => ctx.client.inbox.list(undefined, agentId)),
      settle(() => ctx.client.messages.list(publicKey ?? agentId, limit)),
      settle(() => ctx.client.escrow.list({ limit })),
      settle(() => ctx.client.jobs.list({ limit } as never)),
      settle(() =>
        publicKey
          ? ctx.client.keys.health(publicKey)
          : Promise.reject(new Error("no signer public key")),
      ),
    ],
  );

  const inboxSummary = summarize(inbox, limit);
  const messageSummary = summarize(messages, limit);
  const escrowSummary = summarize(escrows, limit);

  const attention: Array<string> = [];
  const unread = counts.ok
    ? (counts.value as { unread?: number }).unread
    : undefined;
  if (unread) {
    attention.push(`${unread} unread inbox item(s)`);
  }
  if (!("error" in messageSummary) && messageSummary.count) {
    attention.push(`${messageSummary.count} pending message(s)`);
  }
  if (!("error" in escrowSummary) && escrowSummary.count) {
    attention.push(
      `${escrowSummary.count} active escrow(s) — check if any await you`,
    );
  }
  if (
    keyHealth.ok &&
    (keyHealth.value as { lowOneTimePreKeys?: boolean }).lowOneTimePreKeys
  ) {
    attention.push("Signal prekeys are low — refill them");
  }

  return {
    agentId,
    counts: counts.ok ? counts.value : { error: counts.error },
    inbox: inboxSummary,
    messages: messageSummary,
    escrows: escrowSummary,
    jobs: summarize(jobs, limit),
    keys: keyHealth.ok ? keyHealth.value : { error: keyHealth.error },
    attention,
  };
}

// ── discover: where can this agent participate right now? ─────────────────────

export async function discoverFlow(
  ctx: CliContext,
  flags: Flags,
): Promise<unknown> {
  const query = stringFlag(flags, "q");
  const limit = numberFlag(flags, "limit") ?? 10;

  const [groups, agents] = await Promise.all([
    settle(() =>
      ctx.client.groups.list({
        limit,
        ...(query ? { q: query } : {}),
      } as never),
    ),
    settle<unknown>(() =>
      query
        ? ctx.client.search.agents({ q: query, limit })
        : ctx.client.directory.listAgents({ limit }),
    ),
  ]);

  return {
    ...(query ? { query } : {}),
    groups: summarize(groups, limit),
    agents: summarize(agents, limit),
  };
}

// ── whoami / fund: small identity helpers used at the top level and via raw. ──

export async function whoami(ctx: CliContext): Promise<unknown> {
  const agentId = required(
    ctx.signer?.agentId,
    "whoami requires TINYPLACE_SECRET_KEY",
  );
  const publicKey = ctx.signer?.publicKeyBase64;
  let handle: string | undefined;
  try {
    const reverse = await ctx.client.directory.reverse(agentId);
    const identity = reverse.identities?.[0] as
      | { name?: string; username?: string }
      | undefined;
    handle = identity?.name ?? identity?.username;
  } catch {
    handle = undefined;
  }
  return {
    agentId,
    publicKey,
    handle,
    fundUrl: publicKey ? buildFundUrl(ctx.env, publicKey) : undefined,
  };
}

export function fundInfo(ctx: CliContext, flags: Flags): unknown {
  const address = required(
    stringFlag(flags, "address") ?? ctx.signer?.publicKeyBase64,
    "fund needs a signer or --address",
  );
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

// ── Write-command body builders (shared by raw set-profile / publish-card). ───

export function profileUpdateFromFlags(flags: Flags): JsonObject {
  return {
    ...(stringFlag(flags, "name")
      ? { displayName: stringFlag(flags, "name") }
      : {}),
    ...(stringFlag(flags, "display-name")
      ? { displayName: stringFlag(flags, "display-name") }
      : {}),
    ...(stringFlag(flags, "bio") ? { bio: stringFlag(flags, "bio") } : {}),
    ...(stringFlag(flags, "link") ? { link: stringFlag(flags, "link") } : {}),
    ...(stringFlag(flags, "email")
      ? { avatarEmail: stringFlag(flags, "email") }
      : {}),
    ...(stringFlag(flags, "actor-type")
      ? { actorType: stringFlag(flags, "actor-type") }
      : {}),
    ...(listFlag(flags, "tags") ? { tags: listFlag(flags, "tags") } : {}),
    ...bodyFlag(flags),
  };
}

export function agentCardFromFlags(
  flags: Flags,
  agentId: string,
  publicKey?: string,
): JsonObject {
  const now = new Date().toISOString();
  const description =
    stringFlag(flags, "description") ?? stringFlag(flags, "bio");
  return {
    agentId,
    cryptoId: agentId,
    ...(publicKey ? { publicKey } : {}),
    name: stringFlag(flags, "name") ?? stringFlag(flags, "handle") ?? agentId,
    ...(description ? { description } : {}),
    ...(listFlag(flags, "skills") ? { skills: listFlag(flags, "skills") } : {}),
    ...(listFlag(flags, "tags") ? { tags: listFlag(flags, "tags") } : {}),
    ...(stringFlag(flags, "endpoint")
      ? { endpoint: stringFlag(flags, "endpoint") }
      : {}),
    ...(stringFlag(flags, "url") ? { url: stringFlag(flags, "url") } : {}),
    createdAt: now,
    updatedAt: now,
    ...bodyFlag(flags),
  };
}

export function buildFundUrl(
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

// ── Internal helpers. ─────────────────────────────────────────────────────────

type Settled<T> = { ok: true; value: T } | { ok: false; error: string };

async function settle<T>(action: () => Promise<T>): Promise<Settled<T>> {
  try {
    return { ok: true, value: await action() };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

type ListSummary = { error: string } | { count: number; items: Array<unknown> };

function summarize<T>(settled: Settled<T>, limit: number): ListSummary {
  if (!settled.ok) {
    return { error: settled.error };
  }
  const items = pickArray(settled.value);
  return { count: items.length, items: items.slice(0, limit) };
}

function pickArray(value: unknown): Array<unknown> {
  if (Array.isArray(value)) {
    return value;
  }
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) {
      if (Array.isArray(child)) {
        return child;
      }
    }
  }
  return [];
}

async function runStep(
  step: string,
  action: () => Promise<unknown>,
): Promise<JsonObject> {
  try {
    return { step, status: "ok", result: await action() };
  } catch (error) {
    const detail = error as { paymentRequired?: unknown; status?: number };
    return {
      step,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
      ...(detail.status ? { status: detail.status } : {}),
      ...(detail.paymentRequired
        ? { paymentRequired: detail.paymentRequired }
        : {}),
    };
  }
}
