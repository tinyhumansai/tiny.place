import {
  bodyFlag,
  hexToBytes,
  listFlag,
  required,
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
import { idOf, resolveAgentId } from "./workflows.js";
import type { PaymentChallenge } from "../http.js";
import type { Identity } from "../types/index.js";
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
  const asset = await resolveRegistrationAsset(ctx, opts.challenge?.asset);

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

    const shortfall = await paymentShortfall(ctx, request.cryptoId, opts.challenge);
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
): Promise<JsonObject | undefined> {
  if (!challenge?.amount) {
    return undefined;
  }
  let held: bigint | undefined;
  try {
    const balances = await ctx.client.solana.balances(address);
    const symbol = (challenge.asset ?? "USDC").toUpperCase();
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
  const fundFlags = challenge.asset ? ` --asset ${challenge.asset}` : "";
  return {
    status: "payment-required",
    payment: {
      ...(challenge.asset ? { asset: challenge.asset } : {}),
      ...(challenge.amount ? { amount: challenge.amount } : {}),
    },
    note: `Wallet holds ${held} but registration needs ${challenge.amount} ${challenge.asset ?? ""}. Fund, then retry.`,
    suggestions: [
      suggest("Fund your wallet", `tinyplace fund${fundFlags}`),
      suggest("Then claim the handle", "tinyplace status"),
    ],
  };
}

/** Resolves the SPL mint + decimals for the registration asset from `/solana`. */
async function resolveRegistrationAsset(
  ctx: CliContext,
  assetSymbol: string | undefined,
): Promise<{ mint?: string; decimals?: number } | undefined> {
  try {
    const info = await ctx.client.solana.info();
    const symbol = (assetSymbol ?? "USDC").toUpperCase();
    const asset = info.assets.find(
      (entry) => entry.symbol.toUpperCase() === symbol,
    );
    if (!asset) {
      return undefined;
    }
    return {
      ...(asset.address ? { mint: asset.address } : {}),
      decimals: asset.decimals,
    };
  } catch {
    return undefined;
  }
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

