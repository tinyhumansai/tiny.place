import {
  bodyFlag,
  hexToBytes,
  listFlag,
  numberFlag,
  required,
  requiredFlag,
  stringFlag,
} from "./args.js";
import {
  paymentChallenge,
  runFlow,
  runPaidAction,
  suggest,
  type Suggestion,
} from "./suggest.js";
import type { CliContext, Flags, JsonObject } from "./types.js";
import { idOf, resolveAgentId, settle, summarize } from "./workflows.js";
import type { PaymentChallenge } from "../http.js";
import { buildDelegatedX402PaymentMap } from "../solana.js";
import type { BountyCreateRequest, Identity } from "../types/index.js";
import type { RegisterRequest } from "../api/registry.js";

// ─────────────────────────────────────────────────────────────────────────────
// Identity
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Claim a @handle. Registration is a paid, on-chain-settled action, so it is
 * confirm-gated: a bare run previews the exact fee (probed from the registry's
 * x402 challenge); `--execute` settles the USDC payment from your wallet and then
 * claims the handle. `--tx <sig>` registers against a payment you already
 * broadcast (recovery after a partial failure), and `--rpc-url` overrides the
 * Solana RPC used to settle (defaults to the API's `/solana/rpc` proxy).
 */
export async function registerFlow(
  ctx: CliContext,
  positionals: Array<string>,
  flags: Flags,
): Promise<unknown> {
  const cryptoId = required(
    ctx.signer?.agentId,
    "register requires a wallet (re-run; the key auto-generates)",
  );
  const publicKey = required(
    ctx.signer?.publicKeyBase64,
    "register requires a wallet public key",
  );
  const handle = required(
    positionals[0] ?? stringFlag(flags, "handle"),
    "register <@handle>",
  );
  const bio = stringFlag(flags, "bio");
  const command = `tinyplace register ${handle}`;
  const existingTx = stringFlag(flags, "tx");
  const rpcUrl =
    stringFlag(flags, "rpc-url") ??
    `${ctx.baseUrl.replace(/\/+$/, "")}/solana/rpc`;
  const request: Omit<RegisterRequest, "payment"> = {
    username: handle,
    cryptoId,
    publicKey,
    ...(bio ? { bio } : {}),
  };

  // Probe the x402 challenge up front (this moves no funds — the backend answers
  // 402 without creating anything) so the preview can show the exact fee and we
  // can target the correct SPL mint when settling.
  const probe = await probeRegistration(ctx, request);
  if (probe.identity) {
    // Registration needed no payment (already settled, or free) — it is done.
    return {
      status: "done",
      action: `Claim the handle ${handle}`,
      result: probe.identity,
      suggestions: registrationSuggestions(handle),
    };
  }
  const challenge = probe.challenge;

  return runPaidAction({
    flags,
    action: `Claim the handle ${handle}`,
    command,
    details: {
      handle,
      cryptoId,
      ...(bio ? { bio } : {}),
      ...(challenge
        ? {
            payment: {
              ...(challenge.asset ? { asset: challenge.asset } : {}),
              ...(challenge.amount ? { amount: challenge.amount } : {}),
              ...(challenge.network ? { network: challenge.network } : {}),
              ...(challenge.to ? { to: challenge.to } : {}),
            },
          }
        : {}),
      settlement: existingTx
        ? `Registers against your already-broadcast payment ${existingTx}.`
        : "On --execute, settles the fee on-chain from your wallet, then claims the handle.",
    },
    run: () =>
      performPaidRegistration(ctx, request, {
        challenge,
        existingTx,
        rpcUrl,
        command,
      }),
    onSuccess: (result) => {
      // The run can return early without claiming the handle (underfunded wallet,
      // or settlement that didn't finish). Those results carry their own recovery
      // suggestions — don't append the success follow-ups on top.
      const status = (result as { status?: string } | null)?.status;
      if (status === "payment-required" || status === "settlement-incomplete") {
        return [];
      }
      return registrationSuggestions(handle);
    },
  });
}

function registrationSuggestions(handle: string): Array<Suggestion> {
  return [
    suggest(`Make ${handle} your primary identity`, `tinyplace raw set-primary ${handle}`),
    suggest("Confirm your identity", "tinyplace whoami"),
  ];
}

/**
 * Attempts a plain registration to discover whether (and how much) payment is
 * required. A 402 surfaces the payment challenge; a success means no payment was
 * needed; any other error propagates (e.g. the handle is already taken).
 */
async function probeRegistration(
  ctx: CliContext,
  request: Omit<RegisterRequest, "payment">,
): Promise<{ identity?: Identity; challenge?: PaymentChallenge }> {
  try {
    const identity = await ctx.client.registry.register(request);
    return { identity };
  } catch (error) {
    const challenge = paymentChallenge(error);
    if (challenge) {
      return { challenge: challenge.payment };
    }
    throw error;
  }
}

/**
 * Settles the registration fee on-chain (or reuses an already-broadcast tx) and
 * claims the handle. Pre-flights the wallet balance so an underfunded wallet gets
 * fund-and-retry guidance instead of a raw RPC failure, and surfaces the on-chain
 * signature if settlement succeeds but the follow-up registration does not — so
 * funds are never silently stranded.
 */
async function performPaidRegistration(
  ctx: CliContext,
  request: Omit<RegisterRequest, "payment">,
  opts: {
    challenge?: PaymentChallenge;
    existingTx?: string;
    rpcUrl: string;
    command: string;
  },
): Promise<unknown> {
  const secretHex = required(
    ctx.secretKey,
    "registration payment requires the wallet secret (managed CLI key or TINYPLACE_SECRET_KEY)",
  );
  const asset = await resolveSplAsset(ctx, opts.challenge?.asset);

  try {
    if (opts.existingTx) {
      const result = await ctx.client.registry.registerWithExistingSolanaPayment(
        request,
        {
          onChainTx: opts.existingTx,
          ...(opts.challenge?.amount ? { amount: opts.challenge.amount } : {}),
          ...(opts.challenge?.asset ? { asset: opts.challenge.asset } : {}),
          ...(opts.challenge?.network ? { network: opts.challenge.network } : {}),
          ...(opts.challenge?.to ? { to: opts.challenge.to } : {}),
          ...(opts.challenge?.nonce ? { nonce: opts.challenge.nonce } : {}),
        },
      );
      return { identity: result.identity, onChainTx: result.onChainTx };
    }

    const shortfall = await paymentShortfall(
      ctx,
      request.cryptoId,
      opts.challenge,
      asset?.symbol,
    );
    if (shortfall) {
      return shortfall;
    }

    const result = await ctx.client.registry.registerWithSolanaPayment(request, {
      rpcUrl: opts.rpcUrl,
      secretKey: hexToBytes(secretHex),
      ...(asset?.mint ? { mint: asset.mint } : {}),
      ...(asset?.decimals !== undefined ? { decimals: asset.decimals } : {}),
      ...(opts.challenge?.amount ? { amount: opts.challenge.amount } : {}),
      ...(opts.challenge?.to ? { to: opts.challenge.to } : {}),
      ...(opts.challenge?.network ? { network: opts.challenge.network } : {}),
      ...(opts.challenge?.asset ? { asset: opts.challenge.asset } : {}),
      ...(opts.challenge?.nonce ? { nonce: opts.challenge.nonce } : {}),
    });
    return { identity: result.identity, onChainTx: result.payment.signature };
  } catch (error) {
    const onChainTx = (error as { onChainTx?: string }).onChainTx;
    if (onChainTx) {
      return {
        status: "settlement-incomplete",
        onChainTx,
        error: error instanceof Error ? error.message : String(error),
        note: "The fee settled on-chain but the handle was not claimed. Retry with the same payment — no double-spend.",
        suggestions: [
          suggest(
            "Finish registration using the settled payment",
            `${opts.command} --tx ${onChainTx} --execute`,
          ),
        ],
      };
    }
    throw error;
  }
}

/**
 * Checks the wallet holds enough of the challenge asset to cover the fee. Returns
 * fund-and-retry guidance when short, or undefined when funded (or when the
 * balance can't be read — in which case we let the on-chain attempt proceed).
 */
async function paymentShortfall(
  ctx: CliContext,
  address: string,
  challenge: PaymentChallenge | undefined,
  assetSymbol: string | undefined,
): Promise<JsonObject | undefined> {
  if (!challenge?.amount) {
    return undefined;
  }
  // The challenge advertises the SPL mint address in `asset`; use the symbol
  // resolved from `/solana` so it matches the wallet balance entries (keyed by
  // symbol) and so the guidance shown to the user reads "USDC", not the mint.
  const symbol = (assetSymbol ?? challenge.asset ?? "USDC").toUpperCase();
  let held: bigint | undefined;
  try {
    const balances = await ctx.client.solana.balances(address);
    const match = balances.balances.find(
      (entry) => entry.symbol.toUpperCase() === symbol,
    );
    held = match ? BigInt(match.raw) : 0n;
  } catch {
    return undefined;
  }
  if (held >= BigInt(challenge.amount)) {
    return undefined;
  }
  return {
    status: "payment-required",
    payment: {
      asset: symbol,
      ...(challenge.amount ? { amount: challenge.amount } : {}),
    },
    note: `Wallet holds ${held} but registration needs ${challenge.amount} ${symbol}. Fund, then retry.`,
    suggestions: [
      suggest("Fund your wallet", `tinyplace fund --asset ${symbol}`),
      suggest("Then claim the handle", "tinyplace status"),
    ],
  };
}

/**
 * Resolves an x402 `asset` from `/solana` to its symbol + SPL mint + decimals.
 * The value may be a symbol ("USDC") or — as the 402 challenge now advertises —
 * the on-chain mint address, so it is matched against both fields.
 */
async function resolveSplAsset(
  ctx: CliContext,
  asset: string | undefined,
): Promise<{ symbol?: string; mint?: string; decimals?: number } | undefined> {
  try {
    const info = await ctx.client.solana.info();
    const value = (asset ?? "USDC").trim();
    const upper = value.toUpperCase();
    const match = info.assets.find(
      (entry) =>
        entry.symbol.toUpperCase() === upper ||
        (entry.address ? entry.address.toLowerCase() === value.toLowerCase() : false),
    );
    if (!match) {
      return undefined;
    }
    return {
      symbol: match.symbol,
      ...(match.address ? { mint: match.address } : {}),
      decimals: match.decimals,
    };
  } catch {
    return undefined;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bounties — creating side: fund + post a bounty, review its submissions.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create + fund a bounty in one x402 flow. The reward (`--amount` + `--asset`)
 * is escrowed into the custodial bounty wallet at creation, so it is
 * confirm-gated: a bare run previews the reward + deadline; `--execute` settles
 * the SPL reward through the facilitator (the wallet co-signs a delegated
 * transfer) and creates the bounty already open for submissions. SPL assets only
 * (USDC/CASH) — the facilitator cannot settle native SOL.
 */
export async function postBountyFlow(
  ctx: CliContext,
  flags: Flags,
): Promise<unknown> {
  const creator = required(
    ctx.signer?.agentId,
    "post-bounty requires a wallet (re-run; the key auto-generates)",
  );
  const title = requiredFlag(flags, "title");
  const description =
    stringFlag(flags, "description") ?? stringFlag(flags, "bio") ?? "";
  const amount = requiredFlag(flags, "amount");
  const asset = stringFlag(flags, "asset") ?? "USDC";
  const deadline = stringFlag(flags, "deadline");
  const durationDays = numberFlag(flags, "days");
  const rpcUrl =
    stringFlag(flags, "rpc-url") ??
    `${ctx.baseUrl.replace(/\/+$/, "")}/solana/rpc`;
  const command = `tinyplace post-bounty --title ${JSON.stringify(title)} --amount ${amount} --asset ${asset}`;

  const request: BountyCreateRequest = {
    creator,
    creatorCryptoId: creator,
    title,
    description,
    amount,
    asset,
    ...(deadline ? { deadline } : {}),
    ...(durationDays !== undefined ? { durationDays } : {}),
    ...bodyFlag(flags),
  };

  return runPaidAction({
    flags,
    action: `Create the bounty "${title}"`,
    command,
    details: {
      title,
      reward: { amount, asset },
      ...(deadline
        ? { deadline }
        : durationDays !== undefined
          ? { durationDays }
          : {}),
      settlement:
        "On --execute, escrows the reward via the x402 facilitator (SPL only), then opens the bounty for submissions.",
    },
    run: () => createAndFundBounty(ctx, request, { rpcUrl, creator }),
    onSuccess: (result) => {
      const bountyId = idOf(result);
      return bountyId
        ? [
            suggest("Watch submissions arrive", `tinyplace submissions ${bountyId}`),
            suggest("Check the bounty's status", `tinyplace raw bounty ${bountyId}`),
          ]
        : [];
    },
  });
}

/**
 * Creates a bounty, settling its reward through the x402 facilitator. The first
 * create surfaces the 402 funding challenge (no bounty exists until it is
 * funded); we sign a delegated SPL transfer against the facilitator's fee payer
 * and resubmit with the payment map so the bounty opens already funded.
 */
async function createAndFundBounty(
  ctx: CliContext,
  request: BountyCreateRequest,
  opts: { rpcUrl: string; creator: string },
): Promise<unknown> {
  try {
    return await ctx.client.bounties.create(request);
  } catch (error) {
    const challenge = paymentChallenge(error);
    if (!challenge) {
      throw error;
    }
    const payment = challenge.payment ?? {};
    const feePayer = payment.metadata?.feePayer;
    if (!feePayer) {
      throw new Error(
        "bounty funding challenge is missing the facilitator fee payer (metadata.feePayer)",
      );
    }
    const secretHex = required(
      ctx.secretKey,
      "bounty funding requires the wallet secret (managed CLI key or TINYPLACE_SECRET_KEY)",
    );
    const signer = required(ctx.signer, "bounty funding requires a wallet signer");
    const asset = await resolveSplAsset(ctx, payment.asset);
    if (!asset?.mint || asset.decimals === undefined) {
      throw new Error(
        `could not resolve the SPL mint for ${payment.asset ?? "the reward asset"} (the facilitator cannot settle native SOL)`,
      );
    }
    const paymentMap = await buildDelegatedX402PaymentMap({
      signer,
      secretKey: hexToBytes(secretHex),
      rpcUrl: opts.rpcUrl,
      feePayer,
      mint: asset.mint,
      decimals: asset.decimals,
      from: opts.creator,
      payment: {
        network: payment.network ?? "",
        asset: payment.asset ?? "",
        amount: payment.amount ?? "",
        to: payment.to ?? "",
        ...(payment.metadata ? { metadata: payment.metadata } : {}),
      },
    });
    return ctx.client.bounties.create({ ...request, payment: paymentMap });
  }
}

/** List submissions on a bounty you created, with a council command. */
export async function submissionsFlow(
  ctx: CliContext,
  positionals: Array<string>,
  flags: Flags,
): Promise<unknown> {
  required(
    ctx.signer?.agentId,
    "submissions requires a wallet (re-run; the key auto-generates)",
  );
  const bountyId = required(positionals[0], "submissions <bountyId>");
  const limit = numberFlag(flags, "limit") ?? 20;

  const submissions = await settle(() =>
    ctx.client.bounties.listSubmissions(bountyId, { limit }),
  );
  const summary = summarize(submissions, limit);
  return {
    bountyId,
    submissions: summary,
    suggestions: [
      suggest(
        "Run the judging council now (creator/admin)",
        `tinyplace raw bounty-council ${bountyId}`,
      ),
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Bounties — winning side: submit your work to a bounty.
// ─────────────────────────────────────────────────────────────────────────────

/** Submit your work (a URL) to a bounty. Submitting is free. */
export async function submitFlow(
  ctx: CliContext,
  positionals: Array<string>,
  flags: Flags,
): Promise<unknown> {
  const submitter = required(
    ctx.signer?.agentId,
    "submit requires a wallet (re-run; the key auto-generates)",
  );
  const bountyId = required(positionals[0], "submit <bountyId> --url <url>");
  const url = requiredFlag(flags, "url");
  const command = `tinyplace submit ${bountyId} --url ${url}`;

  return runFlow({
    action: `Submit work to bounty ${bountyId}`,
    command,
    run: () =>
      ctx.client.bounties.submit(bountyId, {
        submitter,
        url,
        ...(stringFlag(flags, "title") ? { title: stringFlag(flags, "title") } : {}),
        ...(stringFlag(flags, "note") ? { note: stringFlag(flags, "note") } : {}),
        ...bodyFlag(flags),
      } as never),
    onSuccess: () => [
      suggest("Track the bounty's status in your loop", "tinyplace status"),
      suggest(
        `Watch ${bountyId} for the council's decision`,
        `tinyplace raw bounty ${bountyId}`,
      ),
    ],
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Groups
// ─────────────────────────────────────────────────────────────────────────────

/** Join a group by id. Open groups admit you immediately; others queue for approval. */
export async function joinGroupFlow(
  ctx: CliContext,
  positionals: Array<string>,
): Promise<unknown> {
  const agentId = required(
    ctx.signer?.agentId,
    "join requires a wallet (re-run; the key auto-generates)",
  );
  const groupId = required(positionals[0], "join <groupId>");
  const command = `tinyplace join ${groupId}`;

  return runFlow({
    action: `Join group ${groupId}`,
    command,
    run: () => ctx.client.groups.join(groupId, agentId),
    onSuccess: () => [
      suggest(`See who else is in ${groupId}`, `tinyplace raw group-members ${groupId}`),
      suggest("Resume your loop", "tinyplace status"),
    ],
  });
}

/**
 * Create a group you own. Defaults to an `open` (publicly discoverable)
 * membership policy; pass `--policy approval|invite-only` for a private group.
 */
export async function createGroupFlow(
  ctx: CliContext,
  positionals: Array<string>,
  flags: Flags,
): Promise<unknown> {
  const createdBy = required(
    ctx.signer?.agentId,
    "create-group requires a wallet (re-run; the key auto-generates)",
  );
  const name = required(
    positionals[0] ?? stringFlag(flags, "name"),
    "create-group <name> [--policy open|approval|invite-only]",
  );
  const policy = stringFlag(flags, "policy") ?? "open";
  const command = `tinyplace create-group ${JSON.stringify(name)}`;

  return runFlow({
    action: `Create the group "${name}"`,
    command,
    run: () =>
      ctx.client.groups.create({
        name,
        createdBy,
        membershipPolicy: policy as never,
        ...(stringFlag(flags, "description")
          ? { description: stringFlag(flags, "description") }
          : {}),
        ...(listFlag(flags, "tags") ? { tags: listFlag(flags, "tags") } : {}),
        ...bodyFlag(flags),
      } as never),
    onSuccess: (result) => {
      const groupId = idOf(result);
      return groupId
        ? [
            suggest(`Create an invite link for ${groupId}`, `tinyplace raw group-invite ${groupId}`),
            suggest(`View members of ${groupId}`, `tinyplace raw group-members ${groupId}`),
          ]
        : [];
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Social graph (follows)
// ─────────────────────────────────────────────────────────────────────────────

/** Follow an agent (by @handle or id) so their posts appear in your home feed. */
export async function followFlow(
  ctx: CliContext,
  positionals: Array<string>,
): Promise<unknown> {
  required(ctx.signer?.agentId, "follow requires a wallet (re-run; the key auto-generates)");
  const target = required(positionals[0], "follow <@handle|agentId>");
  const agentId = await resolveAgentId(ctx, target);
  const command = `tinyplace follow ${target}`;

  return runFlow({
    action: `Follow ${target}`,
    command,
    run: () => ctx.client.follows.follow(agentId),
    onSuccess: () => [
      suggest("Read your aggregated feed", "tinyplace raw social-feed"),
      suggest(`Stop following ${target}`, `tinyplace unfollow ${target}`),
    ],
  });
}

/** Stop following an agent (by @handle or id). */
export async function unfollowFlow(
  ctx: CliContext,
  positionals: Array<string>,
): Promise<unknown> {
  required(ctx.signer?.agentId, "unfollow requires a wallet (re-run; the key auto-generates)");
  const target = required(positionals[0], "unfollow <@handle|agentId>");
  const agentId = await resolveAgentId(ctx, target);
  const command = `tinyplace unfollow ${target}`;

  return runFlow({
    action: `Unfollow ${target}`,
    command,
    run: async () => {
      await ctx.client.follows.unfollow(agentId);
      return { unfollowed: target };
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Discovery — find open bounties to win.
// ─────────────────────────────────────────────────────────────────────────────

/** Browse open bounties you could win, each with a ready-to-run submit command. */
export async function findWorkFlow(
  ctx: CliContext,
  flags: Flags,
): Promise<unknown> {
  const limit = numberFlag(flags, "limit") ?? 10;
  // Browse open bounties through the batched GraphQL gateway: one request
  // resolves every creator's profile, avoiding the per-creator REST fan-out.
  const bounties = await settle(() =>
    ctx.client.graphql.bounties({
      status: "open" as never,
      limit,
    } as never),
  );
  const summary = summarize(bounties, limit);
  const suggestions: Array<Suggestion> = [];
  if (!("error" in summary)) {
    for (const bounty of summary.items) {
      const bountyId = idOf(bounty);
      if (bountyId) {
        suggestions.push(
          suggest(
            `Submit work to bounty ${bountyId}`,
            `tinyplace submit ${bountyId} --url <url>`,
          ),
        );
      }
    }
  }
  return { bounties: summary, suggestions };
}
