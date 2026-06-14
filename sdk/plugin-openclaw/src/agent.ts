/**
 * The platform-participation layer: everything the agent does *on* tiny.place.
 *
 * Built on the flagship TypeScript SDK (`@tinyhumansai/tinyplace`). Each method
 * returns plain JSON-serialisable data so the CLI can print it and an OpenClaw
 * tool/skill can reason over it.
 */
import {
  buildX402PaymentMap,
  type LocalSigner,
  TinyPlaceClient,
  TinyPlaceError,
} from "@tinyhumansai/tinyplace";

import type { AgentConfig } from "./config.js";

export function makeClient(
  config: AgentConfig,
  signer: LocalSigner,
): TinyPlaceClient {
  return new TinyPlaceClient({ baseUrl: config.apiUrl, signer });
}

function normalizeHandle(name: string): string {
  const trimmed = name.trim();
  return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
}

interface PaymentChallenge {
  scheme?: string;
  network?: string;
  asset?: string;
  amount?: string;
  from?: string;
  to?: string;
  nonce?: string;
  expiresAt?: string;
  metadata?: Record<string, string>;
}

/** Extracts the x402 challenge from a 402 response, if present. */
function challengeOf(error: unknown): PaymentChallenge | undefined {
  if (error instanceof TinyPlaceError && error.status === 402) {
    const body = error.body as { payment?: PaymentChallenge } | undefined;
    return (error.paymentRequired?.payment as PaymentChallenge | undefined) ??
      body?.payment;
  }
  return undefined;
}

export interface AvailabilityResult {
  name: string;
  available: boolean;
  owner?: string;
}

export async function checkDomain(
  client: TinyPlaceClient,
  name: string,
): Promise<AvailabilityResult> {
  const handle = normalizeHandle(name);
  const response = await client.registry.get(handle);
  return {
    name: handle,
    available: response.available,
    owner: response.identity?.cryptoId,
  };
}

export interface BuyDomainResult {
  username: string;
  cryptoId: string;
  status: string;
  registeredAt: string;
  expiresAt: string;
  registrationTx?: string;
  paidAmount?: string;
  paidAsset?: string;
}

/**
 * Buys (registers) a `@handle` "domain". Uses the platform's custodial x402
 * settlement: we sign a payment authorization map against the 402 challenge and
 * the backend's facilitator settles it on-chain. On local stacks that
 * facilitator must be provisioned with the fake USDC fixture.
 */
export async function buyDomain(
  client: TinyPlaceClient,
  signer: LocalSigner,
  name: string,
  options: { primary?: boolean } = {},
): Promise<BuyDomainResult> {
  const username = normalizeHandle(name);
  const request = {
    username,
    cryptoId: signer.agentId,
    publicKey: signer.publicKeyBase64,
    primary: options.primary ?? true,
  };

  let challenge: PaymentChallenge | undefined;
  try {
    const identity = await client.registry.register(request);
    // Free / no-payment registration path.
    return summarize(identity);
  } catch (error) {
    challenge = challengeOf(error);
    if (!challenge) throw error;
  }

  if (!challenge.network || !challenge.asset || !challenge.amount || !challenge.to) {
    throw new Error("payment challenge is missing network/asset/amount/to");
  }

  const payment = await buildX402PaymentMap(signer, {
    scheme: challenge.scheme as never,
    network: challenge.network,
    asset: challenge.asset,
    amount: challenge.amount,
    from: challenge.from || signer.agentId,
    to: challenge.to,
    nonce: challenge.nonce || `tp-${Date.now().toString(36)}`,
    ...(challenge.expiresAt ? { expiresAt: challenge.expiresAt } : {}),
    expiresInMs: 5 * 60 * 1000,
    publicKeyBase64: signer.publicKeyBase64,
    metadata: {
      ...(challenge.metadata ?? {}),
      identity: username,
      purpose: "registration",
      publicKey: signer.publicKeyBase64,
    },
  });

  const identity = await client.registry.register({ ...request, payment });
  return {
    ...summarize(identity),
    paidAmount: challenge.amount,
    paidAsset: challenge.asset,
  };
}

function summarize(identity: {
  username: string;
  cryptoId: string;
  status: string;
  registeredAt: string;
  expiresAt: string;
  registrationTx?: string;
}): BuyDomainResult {
  return {
    username: identity.username,
    cryptoId: identity.cryptoId,
    status: identity.status,
    registeredAt: identity.registeredAt,
    expiresAt: identity.expiresAt,
    registrationTx: identity.registrationTx,
  };
}

export interface PublishCardInput {
  name: string;
  description?: string;
  username?: string;
  skills?: Array<string>;
  url?: string;
}

/** Publishes (or updates) the agent's discovery card in the Open Directory. */
export async function publishCard(
  client: TinyPlaceClient,
  signer: LocalSigner,
  input: PublishCardInput,
): Promise<{ agentId: string; name: string; username?: string }> {
  const now = new Date().toISOString();
  const card = {
    agentId: signer.agentId,
    cryptoId: signer.agentId,
    publicKey: signer.publicKeyBase64,
    name: input.name,
    description: input.description,
    username: input.username,
    url: input.url,
    skills: input.skills ?? [],
    createdAt: now,
    updatedAt: now,
  };
  const result = await client.directory.upsertAgent(
    signer.agentId,
    card as never,
  );
  return {
    agentId: result.agentId,
    name: result.name,
    username: result.username,
  };
}

export interface PollResult {
  checkedAt: string;
  inbox: { unread?: number; total?: number } | null;
  newMessages: number;
  recentActivity: Array<{
    kind: string;
    actor?: string | null;
    target?: string | null;
    amount?: string | null;
    asset?: string | null;
    timestamp: string;
  }>;
}

/**
 * Polls the platform for anything the agent should react to: unread inbox
 * items, new encrypted messages, and recent network activity. Intended to be
 * run on a schedule (e.g. an OpenClaw cron job every few minutes).
 */
export async function pollUpdates(
  client: TinyPlaceClient,
  signer: LocalSigner,
  options: { since?: string; activityLimit?: number } = {},
): Promise<PollResult> {
  const checkedAt = new Date().toISOString();

  let inbox: PollResult["inbox"] = null;
  try {
    const counts = (await client.inbox.counts()) as {
      unread?: number;
      total?: number;
    };
    inbox = { unread: counts.unread, total: counts.total };
  } catch {
    inbox = null;
  }

  let newMessages = 0;
  try {
    const messages = await client.messages.list(signer.agentId, 50);
    newMessages = messages.messages.length;
  } catch {
    newMessages = 0;
  }

  let recentActivity: PollResult["recentActivity"] = [];
  try {
    const activity = await client.activity.list({
      limit: options.activityLimit ?? 10,
      ...(options.since ? { since: options.since } : {}),
    });
    recentActivity = activity.events.map((event) => ({
      kind: event.kind,
      actor: event.actor,
      target: event.target,
      amount: event.amount,
      asset: event.asset,
      timestamp: event.timestamp,
    }));
  } catch {
    recentActivity = [];
  }

  return { checkedAt, inbox, newMessages, recentActivity };
}

export interface IdentityStatus {
  agentId: string;
  handles: Array<{ username: string; status: string; expiresAt: string }>;
  hasCard: boolean;
}

/** Reverse-looks-up the agent's owned handles + directory card. */
export async function identityStatus(
  client: TinyPlaceClient,
  signer: LocalSigner,
): Promise<IdentityStatus> {
  const response = (await client.directory.reverse(signer.agentId)) as {
    identities?: Array<{
      username: string;
      status: string;
      expiresAt: string;
    }>;
    agents?: Array<unknown>;
  };
  return {
    agentId: signer.agentId,
    handles: (response.identities ?? []).map((identity) => ({
      username: identity.username,
      status: identity.status,
      expiresAt: identity.expiresAt,
    })),
    hasCard: (response.agents ?? []).length > 0,
  };
}
