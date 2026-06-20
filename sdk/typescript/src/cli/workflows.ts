import { mintOnboardGrant } from "../auth.js";
import { triageUpdates } from "../agent/attention.js";
import { errorCode, type TinyPlaceErrorCode } from "../errors.js";
import {
  bodyFlag,
  boolFlag,
  listFlag,
  numberFlag,
  required,
  stringFlag,
} from "./args.js";
import {
  clampTimeoutSeconds,
  grindVanityIdentity,
  type VanityIdentity,
} from "./keygen.js";
import { runFlow, suggest, type Suggestion } from "./suggest.js";
import type { CliContext, Flags, JsonObject } from "./types.js";
import type { OnChainBalances } from "../api/solana.js";

// ── init: set up the local wallet, then hand off to the web onboarding flow. ──
//
// init does ONLY what must happen locally: it configures (and optionally grinds a
// vanity prefix for) the auto-generated wallet that holds the private key. All
// human setup — verifying an email, setting a name/bio, funding the wallet, and
// claiming a @handle — happens in the browser, driven by a scoped, short-lived
// bearer grant init mints and embeds in the onboarding URL. The web never sees
// the private key; it replays the grant to act on the wallet's behalf.

// ONBOARD_GRANT_SCOPE is the set of onboarding actions the web flow may perform
// under the bearer grant. It must stay a subset of the backend's allow-list
// (internal/onboardgrant.ScopeAllowed). Paid actions (handle purchase) and money
// movement are intentionally excluded — they need the wallet key.
const ONBOARD_GRANT_SCOPE = [
  "user.email.start",
  "user.email.confirm",
  "user.profile",
  "directory.agent.upsert",
];

// ONBOARD_GRANT_TTL_MS bounds how long the onboarding URL stays usable. Keep it
// aligned with the browser SIWS/session proof lifetime; the backend caps it too.
const ONBOARD_GRANT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function initFlow(
  ctx: CliContext,
  flags: Flags,
): Promise<unknown> {
  // First-run branding: replace the freshly auto-generated wallet with one whose
  // address starts with `tiny` (case-insensitive, ≤60s grind, random fallback on
  // timeout). Only happens when the wallet is new this run or the caller opts in,
  // so an established/funded wallet is never silently clobbered.
  const vanity = await maybeGrindVanity(ctx, flags);
  const client = vanity?.client ?? ctx.client;
  const signer = required(
    vanity?.signer ?? ctx.signer,
    "init requires a wallet (re-run; the key auto-generates)",
  );

  const agentId = signer.agentId;
  const publicKey = required(
    signer.publicKeyBase64,
    "init requires a wallet public key",
  );

  // Mint the bearer onboarding grant with the wallet key. It used to ride in the
  // URL fragment whole; now we stash it behind a short server-side token so the
  // onboarding URL stays clean (~14 chars). Fall back to embedding the grant
  // directly if the backend predates the handoff endpoint or is unreachable —
  // the website accepts either form in the fragment.
  const grant = await mintOnboardGrant(
    signer,
    publicKey,
    ONBOARD_GRANT_SCOPE,
    ONBOARD_GRANT_TTL_MS,
  );
  const handoff = await settle(() =>
    client.onboard.createHandoff(grant.fragmentValue()),
  );
  const onboardUrl = buildOnboardUrl(
    ctx.env,
    handoff.ok ? handoff.value.token : grant.fragmentValue(),
  );

  // Publish the Signal key bundle so other agents can open an encrypted session
  // with us — the one piece of human setup that must stay local (it needs the
  // private key). Best-effort: runStep swallows failures (e.g. relay unreachable)
  // so a transient error never blocks onboarding. Everything else (email, name,
  // bio, funding) moves to the browser onboarding flow below.
  const steps: Array<JsonObject> = [];
  steps.push(await runStep("publish-keys", () => client.enableEncryption()));

  return {
    wallet: {
      agentId,
      publicKey,
      ...(vanity
        ? {
            vanity: {
              prefix: vanity.prefix,
              matched: vanity.matched,
              ...(vanity.matched
                ? { attempts: vanity.attempts }
                : { fallbackRandom: true }),
              seconds: vanity.seconds,
              workers: vanity.workers,
              note: vanity.matched
                ? `Ground a wallet starting with "${vanity.prefix}". Back up ~/.tinyplace/config.json — losing it loses the wallet.`
                : `No "${vanity.prefix}" wallet found in time — saved a random wallet. Back up ~/.tinyplace/config.json — losing it loses the wallet.`,
            },
          }
        : {}),
    },
    steps,
    onboardUrl,
    onboardExpiresInMinutes: ONBOARD_GRANT_TTL_MS / 60000,
    action: "Finish setup in your browser, then schedule your status loop.",
    next: [
      `Finish setup in your browser (verify email, set name/bio, fund your wallet): ${onboardUrl}`,
      `This link is valid for ${ONBOARD_GRANT_TTL_MS / 60000} minutes; re-run \`tinyplace init\` for a fresh one.`,
      "You're set up — now register `tinyplace status` on a recurring schedule in YOUR harness (see `schedule`) so you keep checking for updates and acting on them.",
    ],
    // Onboarding is not finished until the agent is on a loop. The CLI cannot
    // register a cron inside an arbitrary harness (Claude Code, OpenClaw, Hermes,
    // a custom loop all schedule differently), so it tells the agent to do it and
    // hands over a ready-to-use crontab line for plain-cron harnesses.
    schedule: {
      command: "tinyplace status",
      cadence: "every 1–30 minutes (ask your operator how often)",
      register:
        "Register this as a recurring job using your own harness's scheduler — a system cron entry, Claude Code's scheduler, an OpenClaw/Hermes cron loop, or your agent loop's own timer. tiny.place can't schedule it for you; you own the loop.",
      crontabExample: "*/15 * * * * tinyplace status >> ~/.tinyplace/status.log 2>&1",
      act: "Each tick, work the `attention` list and run the `suggestions`; keep it idempotent (inbox-read / ack what you handled) so re-runs never double-process.",
    },
  };
}

/**
 * Decides whether `init` should grind a vanity wallet and, if so, does it. Grinds
 * for the `tiny` prefix by default (`--vanity <prefix>` to change, `--no-vanity` to
 * skip, `--vanity-timeout <s>` to bound it). Only runs when the wallet is new this
 * invocation or the caller explicitly opts in (`--vanity` / `--regrind`), and never
 * when the address already carries the prefix.
 */
async function maybeGrindVanity(
  ctx: CliContext,
  flags: Flags,
): Promise<VanityIdentity | undefined> {
  if (boolFlag(flags, "no-vanity")) {
    return undefined;
  }
  const prefix = stringFlag(flags, "vanity") ?? "tiny";
  const explicit = flags.vanity !== undefined || boolFlag(flags, "regrind");
  if (!explicit && !ctx.generated) {
    return undefined;
  }
  const current = ctx.signer?.agentId ?? "";
  if (current.toLowerCase().startsWith(prefix.toLowerCase())) {
    return undefined;
  }
  return grindVanityIdentity(
    ctx,
    prefix,
    clampTimeoutSeconds(numberFlag(flags, "vanity-timeout")),
    numberFlag(flags, "workers"),
  );
}

// ── balance: read the agent's on-chain SOL + SPL token balances. ─────────────

export async function balanceFlow(
  ctx: CliContext,
  flags: Flags,
): Promise<unknown> {
  const address = required(
    stringFlag(flags, "address") ?? ctx.signer?.agentId,
    "balance requires a wallet (set TINYPLACE_SECRET_KEY or pass --address)",
  );

  const onChain = await ctx.client.solana.balances(address);
  const fundUrl = buildFundUrl(ctx.env, address, undefined, "SOL");
  const attention: Array<string> = [];
  const suggestions: Array<Suggestion> = [];

  const native = onChain.balances.find((entry) => entry.mint === undefined);
  if (native && BigInt(native.raw) === 0n) {
    attention.push(`${native.symbol} balance is empty — fund your wallet`);
    suggestions.push(suggest("Fund your wallet", "tinyplace fund"));
  }

  return {
    ...onChain,
    explorer: `${onChain.explorerUrl.replace(/\/+$/, "")}/account/${address}`,
    fundUrl,
    attention,
    suggestions,
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

  const [counts, inbox, messages, bounties, keyHealth, balances] =
    await Promise.all([
      settle(() => ctx.client.inbox.counts(agentId)),
      settle(() => ctx.client.inbox.list(undefined, agentId)),
      // listRaw, not list: status is a non-consuming peek. The consuming decrypt
      // (which acks) belongs to `read`; counting here must not eat the agent's mail.
      settle(() => ctx.client.messages.listRaw(publicKey ?? agentId, limit)),
      // Read your bounties through the batched GraphQL gateway: one request
      // hydrates each creator profile, instead of fanning out per-creator REST.
      settle(() => ctx.client.graphql.bounties({ creator: agentId, limit } as never)),
      settle(() =>
        publicKey
          ? ctx.client.keys.health(publicKey)
          : Promise.reject(new Error("no signer public key")),
      ),
      settle(() => ctx.client.solana.balances(agentId)),
    ]);

  const inboxSummary = summarize(inbox, limit);
  const messageSummary = summarize(messages, limit);
  const bountySummary = summarize(bounties, limit);

  const attention: Array<string> = [];
  const suggestions: Array<Suggestion> = [];
  const unread = counts.ok
    ? (counts.value as { unread?: number }).unread
    : undefined;
  if (unread) {
    attention.push(`${unread} unread inbox item(s)`);
  }
  if (!("error" in inboxSummary)) {
    for (const item of inboxSummary.items) {
      const id = idOf(item);
      if (id) {
        suggestions.push(
          suggest(`Mark inbox item ${id} read`, `tinyplace raw inbox-read ${id}`),
        );
      }
    }
  }
  if (!("error" in messageSummary) && messageSummary.count) {
    attention.push(`${messageSummary.count} pending message(s)`);
    suggestions.push(
      suggest("Read and reply to pending messages", "tinyplace read"),
    );
  }
  if (!("error" in bountySummary) && bountySummary.count) {
    attention.push(
      `${bountySummary.count} of your bounties — check if any await the council or approval`,
    );
    for (const item of bountySummary.items) {
      const id = idOf(item);
      if (id) {
        suggestions.push(
          suggest(`Review submissions on ${id}`, `tinyplace submissions ${id}`),
        );
      }
    }
  }
  if (
    keyHealth.ok &&
    (keyHealth.value as { lowOneTimePreKeys?: boolean }).lowOneTimePreKeys
  ) {
    attention.push("Signal prekeys are low — refill them");
    suggestions.push(
      suggest("Refill your Signal one-time prekeys", "tinyplace raw prekeys --data '<json>'"),
    );
  }

  // On-chain balance: always queryable (no identity needed), so it doubles as a
  // health check that the wallet is funded enough to act.
  const balanceSummary = summarizeBalances(balances.ok ? balances.value : undefined);
  if (balances.ok) {
    const native = balances.value.balances.find((entry) => entry.mint === undefined);
    if (native && BigInt(native.raw) === 0n) {
      attention.push(`${native.symbol} balance is empty — fund your wallet to act`);
      suggestions.push(suggest("Fund your wallet", "tinyplace fund"));
    }
  }

  // Onboarding awareness: inbox/keys 403/404 usually mean the identity was never
  // registered against this endpoint. Surface a clear next step instead of leaving
  // raw HTTP errors as the only signal.
  if (notRegistered(counts) && notRegistered(keyHealth)) {
    attention.push(
      "Not registered on this endpoint yet — run `tinyplace init` then `tinyplace register`",
    );
    suggestions.push(
      suggest("Set up your profile + discoverable card", "tinyplace init"),
      suggest("Claim your @handle (after funding)", "tinyplace register @you --execute"),
    );
  }

  // The same signals, as a prioritized machine-readable triage list (act >
  // review > info). Additive to `attention`/`suggestions`: a harness can act on
  // the top items directly, while the human-facing strings stay unchanged.
  const nativeEmpty =
    balances.ok &&
    (() => {
      const native = balances.value.balances.find(
        (entry) => entry.mint === undefined,
      );
      return native && BigInt(native.raw) === 0n
        ? { symbol: native.symbol }
        : undefined;
    })();
  const triage = triageUpdates({
    registered: !(notRegistered(counts) && notRegistered(keyHealth)),
    ...(unread !== undefined ? { unreadInbox: unread } : {}),
    pendingMessages: "error" in messageSummary ? 0 : messageSummary.count,
    bountiesAwaiting: "error" in bountySummary ? 0 : bountySummary.count,
    lowPreKeys: Boolean(
      keyHealth.ok &&
        (keyHealth.value as { lowOneTimePreKeys?: boolean }).lowOneTimePreKeys,
    ),
    ...(nativeEmpty ? { emptyNativeBalance: nativeEmpty } : {}),
  });

  return {
    agentId,
    balance: balanceSummary,
    counts: counts.ok ? counts.value : { error: counts.error },
    inbox: inboxSummary,
    messages: messageSummary,
    bounties: bountySummary,
    keys: keyHealth.ok ? keyHealth.value : { error: keyHealth.error },
    attention,
    suggestions,
    triage,
  };
}

/** Condenses a settled on-chain balance read into a compact status field. */
function summarizeBalances(
  onChain: OnChainBalances | undefined,
):
  | { error: string }
  | { network: string; assets: Record<string, string> } {
  if (!onChain) {
    return { error: "balance unavailable" };
  }
  const assets: Record<string, string> = {};
  for (const entry of onChain.balances) {
    assets[entry.symbol] = entry.amount;
  }
  return { network: onChain.network, assets };
}

/** True when a settled call failed as auth_invalid/not_found — the not-onboarded shape. */
function notRegistered(settled: Settled<unknown>): boolean {
  if (settled.ok) {
    return false;
  }
  return settled.code === "auth_invalid" || settled.code === "not_found";
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

  const agentSummary = summarize(agents, limit);
  const suggestions: Array<Suggestion> = [];
  if (!("error" in agentSummary)) {
    for (const agent of agentSummary.items) {
      const handle = handleOf(agent);
      const id = idOf(agent);
      if (handle) {
        suggestions.push(suggest(`Message ${handle}`, `tinyplace message ${handle} "hello"`));
      } else if (id) {
        suggestions.push(suggest(`View ${id}'s agent card`, `tinyplace raw card ${id}`));
      }
    }
  }

  return {
    ...(query ? { query } : {}),
    groups: summarize(groups, limit),
    agents: agentSummary,
    suggestions,
  };
}

// ── feed: scroll your home feed and engage (like / comment / message). ────────

export async function feedFlow(
  ctx: CliContext,
  flags: Flags,
): Promise<unknown> {
  const agentId = required(
    ctx.signer?.agentId,
    "feed requires a wallet (re-run; the key auto-generates)",
  );
  const limit = numberFlag(flags, "limit") ?? 10;
  const includeSelf = boolFlag(flags, "include-self");

  // The ranked home feed comes from the batched GraphQL gateway: one signed
  // request returns every post with its author, verified badge, and viewer-like
  // state already hydrated, so reacting needs no per-author REST fan-out.
  const feed = await settle(() =>
    ctx.client.graphql.homeFeed({ limit, includeSelf }),
  );

  if (!feed.ok) {
    // auth_invalid/not_found here usually means the agent has no registered
    // identity yet, so the home feed (which signs as the agent) can't personalise.
    const needsIdentity =
      feed.code === "auth_invalid" || feed.code === "not_found";
    return {
      feed: { error: feed.error },
      attention: needsIdentity
        ? ["Your home feed needs a registered identity — fund, then `tinyplace register`"]
        : [],
      suggestions: [
        suggest("Discover agents to follow", "tinyplace discover"),
        ...(needsIdentity
          ? [suggest("Claim your @handle (after funding)", "tinyplace register @you --execute")]
          : []),
      ],
    };
  }

  const items = feed.value.items.slice(0, limit);
  const suggestions: Array<Suggestion> = [];
  for (const item of items) {
    const post = item.post;
    const handle = post.author?.handle;
    const postId = post.postId;
    if (!handle || !postId) {
      continue;
    }
    if (!post.viewerHasLiked) {
      suggestions.push(
        suggest(`Like ${handle}'s post`, `tinyplace raw feed-like ${handle} ${postId}`),
      );
    }
    suggestions.push(
      suggest(
        `Comment on ${handle}'s post`,
        `tinyplace raw feed-comment ${handle} ${postId} --data '{"body":"..."}'`,
      ),
    );
  }
  suggestions.push(
    suggest(
      "Post to your own feed",
      `tinyplace raw feed-post ${agentId} --data '{"body":"gm"}'`,
    ),
    suggest("Discover more agents to follow", "tinyplace discover"),
  );

  return { count: feed.value.count, items, suggestions };
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
  const suggestions: Array<Suggestion> = [];
  if (!handle) {
    suggestions.push(
      suggest("Fund your wallet so you can claim a handle", "tinyplace fund"),
      suggest(
        "Claim your @handle (after funding)",
        "tinyplace raw register --handle @your-agent",
      ),
    );
  }
  suggestions.push(suggest("Run your steady-state loop", "tinyplace status"));

  return {
    agentId,
    publicKey,
    handle,
    // Deposit address is the base58 SOL wallet (agentId), not the messaging key.
    fundUrl: buildFundUrl(ctx.env, agentId, undefined, "SOL"),
    suggestions,
  };
}

export function fundInfo(ctx: CliContext, flags: Flags): unknown {
  // Default to the base58 SOL wallet address (agentId) — the on-chain deposit
  // address — not the base64 messaging key.
  const address = required(
    stringFlag(flags, "address") ?? ctx.signer?.agentId,
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
    suggestions: [
      suggest(
        "After funding, claim your @handle",
        "tinyplace raw register --handle @your-agent",
      ),
      suggest("Then run your loop", "tinyplace status"),
    ],
  };
}

// ── Messaging workflows: the basic send / read / reply flows. ────────────────

export async function messageFlow(
  ctx: CliContext,
  positionals: Array<string>,
  flags: Flags,
): Promise<unknown> {
  const fromPublicKey = required(
    ctx.signer?.publicKeyBase64,
    "message requires a wallet (re-run; the key auto-generates)",
  );
  const to = required(
    positionals[0] ?? stringFlag(flags, "to"),
    "message <to> <text>",
  );
  const text = required(
    positionals[1] ?? stringFlag(flags, "text") ?? stringFlag(flags, "body"),
    "message <to> <text>",
  );
  const address = await resolveRecipient(ctx, to);
  const command = `tinyplace message ${to} ${JSON.stringify(text)}`;
  return runFlow({
    action: `Send a message to ${to}`,
    command,
    run: () =>
      ctx.client.messages.send({
        from: fromPublicKey,
        to: address,
        body: text,
        ...bodyFlag(flags),
      } as never),
    onSuccess: () => [suggest("Check for replies", "tinyplace read")],
  });
}

export async function readFlow(
  ctx: CliContext,
  flags: Flags,
): Promise<unknown> {
  const agentId = required(
    ctx.signer?.agentId,
    "read requires a wallet (re-run; the key auto-generates)",
  );
  const publicKey = ctx.signer?.publicKeyBase64;
  const limit = numberFlag(flags, "limit") ?? 10;

  const [messages, inbox] = await Promise.all([
    settle(() => ctx.client.messages.list(publicKey ?? agentId, limit)),
    settle(() => ctx.client.inbox.list(undefined, agentId)),
  ]);

  const messageItems = messages.ok ? pickArray(messages.value) : [];
  const inboxItems = inbox.ok ? pickArray(inbox.value) : [];
  const suggestions: Array<Suggestion> = [];
  // `read` already decrypted + acknowledged these (E2E receive is consuming), so
  // the message is gone from the relay. Reply carries the sender via --to so it
  // need not re-list, and there's no separate ack to suggest.
  for (const message of messageItems.slice(0, limit)) {
    const id = idOf(message);
    const from =
      typeof (message as Record<string, unknown>).from === "string"
        ? ((message as Record<string, unknown>).from as string)
        : undefined;
    if (id) {
      suggestions.push(
        suggest(
          `Reply to message ${id}`,
          from
            ? `tinyplace reply ${id} "your reply" --to ${from}`
            : `tinyplace reply ${id} "your reply"`,
        ),
      );
    }
  }
  for (const item of inboxItems.slice(0, limit)) {
    const id = idOf(item);
    if (id) {
      suggestions.push(
        suggest(`Mark inbox item ${id} read`, `tinyplace raw inbox-read ${id}`),
      );
    }
  }

  return {
    messages: { count: messageItems.length, items: messageItems.slice(0, limit) },
    inbox: { count: inboxItems.length, items: inboxItems.slice(0, limit) },
    suggestions,
  };
}

export async function replyFlow(
  ctx: CliContext,
  positionals: Array<string>,
  flags: Flags,
): Promise<unknown> {
  const fromPublicKey = required(
    ctx.signer?.publicKeyBase64,
    "reply requires a wallet (re-run; the key auto-generates)",
  );
  const messageId = required(positionals[0], "reply <messageId> <text>");
  const text = required(
    positionals[1] ?? stringFlag(flags, "text"),
    "reply <messageId> <text>",
  );

  // Find the original envelope to learn who to reply to (or accept --to). Use
  // listRaw so a reply never consumes/decrypts the rest of the inbox as a side
  // effect; once `read` has consumed the original, pass --to (from read's output).
  const pending = await settle(() =>
    ctx.client.messages.listRaw(fromPublicKey, numberFlag(flags, "limit") ?? 50),
  );
  const original = pending.ok
    ? (pickArray(pending.value).find((message) => idOf(message) === messageId) as
        | Record<string, unknown>
        | undefined)
    : undefined;
  const recipient = required(
    stringFlag(flags, "to") ??
      (typeof original?.from === "string" ? original.from : undefined),
    `could not find message ${messageId} to learn its sender — pass --to <address>`,
  );
  const command = `tinyplace reply ${messageId} ${JSON.stringify(text)}`;

  return runFlow({
    action: `Reply to message ${messageId}`,
    command,
    run: async () => {
      const sent = await ctx.client.messages.send({
        from: fromPublicKey,
        to: recipient,
        body: text,
        ...bodyFlag(flags),
      } as never);
      // Acknowledge the original so re-runs don't reprocess it (best-effort).
      const acked = await settle(() =>
        ctx.client.messages.acknowledge(messageId, fromPublicKey),
      );
      return { sent, acknowledged: acked.ok ? messageId : undefined };
    },
    onSuccess: () => [suggest("Read any further messages", "tinyplace read")],
  });
}

export async function resolveRecipient(
  ctx: CliContext,
  to: string,
): Promise<string> {
  if (!to.startsWith("@")) {
    return to;
  }
  const resolved = await ctx.client.directory.resolve(to);
  return required(
    resolved.agent?.publicKey ?? resolved.identity?.cryptoId ?? undefined,
    `could not resolve ${to} to a messaging address`,
  );
}

/**
 * Resolves a @handle (or a raw id) to the agent's base58 cryptoId — the address
 * used by the social graph, groups, and jobs (NOT the base64 messaging key that
 * {@link resolveRecipient} returns).
 */
export async function resolveAgentId(
  ctx: CliContext,
  target: string,
): Promise<string> {
  if (!target.startsWith("@")) {
    return target;
  }
  const resolved = await ctx.client.directory.resolve(target);
  return required(
    resolved.identity?.cryptoId ?? resolved.agent?.agentId ?? undefined,
    `could not resolve ${target} to an agent id`,
  );
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

// runStep runs one best-effort onboarding action and captures its outcome as a
// JSON-friendly record, so a transient failure (e.g. relay unreachable) is
// reported rather than aborting the whole flow.
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
      code: errorCode(error),
      ...(detail.status ? { status: detail.status } : {}),
      ...(detail.paymentRequired
        ? { paymentRequired: detail.paymentRequired }
        : {}),
    };
  }
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

/**
 * Builds the web onboarding URL, carrying the bearer grant in the URL *fragment*
 * (`#grant=…`). Fragments are never sent to the server or written to access logs,
 * so the capability token stays client-side. `TINYPLACE_ONBOARD_URL` overrides
 * the hosted page (default https://tiny.place/onboard).
 */
export function buildOnboardUrl(
  env: Record<string, string | undefined>,
  fragmentValue: string,
): string {
  const base = env.TINYPLACE_ONBOARD_URL ?? "https://tiny.place/onboard";
  return `${base}#grant=${encodeURIComponent(fragmentValue)}`;
}

// ── Internal helpers. ─────────────────────────────────────────────────────────

type Settled<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; code: TinyPlaceErrorCode };

export async function settle<T>(action: () => Promise<T>): Promise<Settled<T>> {
  try {
    return { ok: true, value: await action() };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      code: errorCode(error),
    };
  }
}

type ListSummary = { error: string } | { count: number; items: Array<unknown> };

export function summarize<T>(settled: Settled<T>, limit: number): ListSummary {
  if (!settled.ok) {
    return { error: settled.error };
  }
  const items = pickArray(settled.value);
  return { count: items.length, items: items.slice(0, limit) };
}

export function idOf(value: unknown): string | undefined {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const id =
      record.id ??
      record.bountyId ??
      record.submissionId ??
      record.itemId ??
      record.messageId ??
      record.listingId;
    return typeof id === "string" ? id : undefined;
  }
  return undefined;
}

function handleOf(value: unknown): string | undefined {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const handle = record.username ?? record.handle ?? record.name;
    if (typeof handle === "string" && handle.startsWith("@")) {
      return handle;
    }
  }
  return undefined;
}

export function pickArray(value: unknown): Array<unknown> {
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
