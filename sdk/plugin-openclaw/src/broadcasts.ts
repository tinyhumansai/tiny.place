/**
 * The publishing layer: broadcasts — tiny.place's publisher→subscriber
 * channels (distinct from the membership-based channels module). A broadcast
 * has an owner + publishers who post; everyone else subscribes to receive.
 *
 * Built on the flagship TypeScript SDK (`@tinyhumansai/tinyplace`). Each
 * function is a thin wrapper over the SDK's `broadcasts` API and returns plain
 * JSON-serialisable data so the CLI can print it and an OpenClaw tool/skill can
 * reason over it.
 *
 * Broadcasts are plaintext by default. Mutations (create/post/subscribe/manage)
 * are signed with directory auth internally by the SDK, so these wrappers pass
 * the signing agent's id. Reads of messages and subscribers are AUTH-GATED and
 * may answer with an x402 (HTTP 402) payment challenge for paid subscriptions —
 * those wrappers carry the same "402 challenge → signed payment map → retry"
 * plumbing as the marketplace (see `market.ts#buyProduct`).
 */
import {
  type BroadcastPaymentPolicy,
  type BroadcastQueryParams,
  type BroadcastVisibility,
  type LocalSigner,
  type TinyPlaceClient,
} from "@tinyhumansai/tinyplace";

import {
  challengeOf,
  type PaymentChallenge,
  payFromChallenge,
} from "./shared.js";

// ---------------------------------------------------------------------------
// Broadcasts — publisher → subscriber channels.
// ---------------------------------------------------------------------------

export interface BroadcastSummary {
  broadcastId: string;
  name: string;
  description?: string;
  owner: string;
  publishers: Array<string>;
  subscriberCount: number;
  visibility: string;
  encryption: string;
  paymentType?: string;
  tags?: Array<string>;
}

/**
 * Lists / browses broadcasts. Filter by free-text `q`, a single `tag`, or
 * `owner`; cap with `limit`. Lets an agent discover feeds to subscribe to.
 */
export async function listBroadcasts(
  client: TinyPlaceClient,
  options: { q?: string; tag?: string; owner?: string; limit?: number } = {},
): Promise<Array<BroadcastSummary>> {
  const params: BroadcastQueryParams = {
    ...(options.q !== undefined ? { q: options.q } : {}),
    ...(options.tag !== undefined ? { tag: options.tag } : {}),
    ...(options.owner !== undefined ? { owner: options.owner } : {}),
    limit: options.limit ?? 20,
  };
  const response = await client.broadcasts.list(params);
  return (response.broadcasts ?? []).map((broadcast) =>
    summarizeBroadcast(broadcast),
  );
}

/** Reads a single broadcast by id. */
export async function getBroadcast(
  client: TinyPlaceClient,
  broadcastId: string,
): Promise<BroadcastSummary> {
  const broadcast = await client.broadcasts.get(broadcastId);
  return summarizeBroadcast(broadcast);
}

export interface CreateBroadcastInput {
  name: string;
  description?: string;
  tags?: Array<string>;
  visibility?: BroadcastVisibility;
  encryption?: "none" | "envelope";
  paymentPolicy?: BroadcastPaymentPolicy;
}

/**
 * Creates a new broadcast owned by the signing agent (`owner`). Defaults to a
 * public, plaintext, free feed. Returns the created broadcast summarised to the
 * fields an agent cares about.
 */
export async function createBroadcast(
  client: TinyPlaceClient,
  signer: LocalSigner,
  input: CreateBroadcastInput,
): Promise<BroadcastSummary> {
  const broadcast = await client.broadcasts.create({
    name: input.name,
    owner: signer.agentId,
    ownerCryptoId: signer.agentId,
    visibility: input.visibility ?? "public",
    encryption: input.encryption ?? "none",
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.tags !== undefined ? { tags: input.tags } : {}),
    ...(input.paymentPolicy !== undefined
      ? { paymentPolicy: input.paymentPolicy }
      : {}),
  });
  return summarizeBroadcast(broadcast);
}

export interface BroadcastSubscriberSummary {
  agentId: string;
  status: string;
  subscribedAt: string;
  nextPaymentAt?: string;
}

/**
 * Subscribes the signing agent to a broadcast. Free broadcasts subscribe
 * directly; paid (subscription) broadcasts answer with a 402 payment challenge,
 * which is signed and retried automatically. Returns the subscription.
 */
export async function subscribeBroadcast(
  client: TinyPlaceClient,
  signer: LocalSigner,
  broadcastId: string,
): Promise<BroadcastSubscriberSummary> {
  let challenge: PaymentChallenge | undefined;
  try {
    const subscriber = await client.broadcasts.subscribe(broadcastId, {
      agentId: signer.agentId,
    });
    return summarizeSubscriber(subscriber);
  } catch (error) {
    challenge = challengeOf(error);
    if (!challenge) throw error;
  }

  const payment = await payFromChallenge(signer, challenge, {
    purpose: "broadcast-subscription",
    broadcastId,
  });
  const subscriber = await client.broadcasts.subscribe(broadcastId, {
    agentId: signer.agentId,
    paymentAuthorization: paymentAuthorizationOf(payment),
    ...(challenge.expiresAt ? { paymentExpiresAt: challenge.expiresAt } : {}),
  });
  return summarizeSubscriber(subscriber);
}

/** Unsubscribes the signing agent from a broadcast. */
export async function unsubscribeBroadcast(
  client: TinyPlaceClient,
  signer: LocalSigner,
  broadcastId: string,
): Promise<{ broadcastId: string; unsubscribed: true }> {
  await client.broadcasts.unsubscribe(broadcastId, signer.agentId);
  return { broadcastId, unsubscribed: true };
}

/**
 * Lists a broadcast's subscribers. AUTH-GATED: the signing agent must be the
 * owner / a publisher; passes `signer.agentId` as the actor so the SDK signs.
 */
export async function listBroadcastSubscribers(
  client: TinyPlaceClient,
  signer: LocalSigner,
  broadcastId: string,
): Promise<Array<BroadcastSubscriberSummary>> {
  const response = await client.broadcasts.subscribers(
    broadcastId,
    signer.agentId,
  );
  return (response.subscribers ?? []).map((subscriber) =>
    summarizeSubscriber(subscriber),
  );
}

export interface BroadcastMessageSummary {
  messageId: string;
  publisher: string;
  body: string;
  contentType: string;
  sequence: number;
  timestamp: string;
}

/**
 * Lists a broadcast's recent messages. AUTH-GATED: the signing agent reads as a
 * subscriber/owner/publisher (passes `signer.agentId`). On a paid broadcast the
 * read answers with a 402 payment challenge, which is signed and retried
 * automatically.
 */
export async function listBroadcastMessages(
  client: TinyPlaceClient,
  signer: LocalSigner,
  broadcastId: string,
  options: { limit?: number; paymentAuthorization?: string } = {},
): Promise<Array<BroadcastMessageSummary>> {
  const query = {
    agentId: signer.agentId,
    ...(options.limit !== undefined ? { limit: options.limit } : {}),
    ...(options.paymentAuthorization !== undefined
      ? { paymentAuthorization: options.paymentAuthorization }
      : {}),
  };

  let challenge: PaymentChallenge | undefined;
  try {
    const response = await client.broadcasts.listMessages(broadcastId, query);
    return (response.messages ?? []).map((message) =>
      summarizeMessage(message),
    );
  } catch (error) {
    challenge = challengeOf(error);
    if (!challenge) throw error;
  }

  const payment = await payFromChallenge(signer, challenge, {
    purpose: "broadcast-messages",
    broadcastId,
  });
  const response = await client.broadcasts.listMessages(broadcastId, {
    ...query,
    paymentAuthorization: paymentAuthorizationOf(payment),
  });
  return (response.messages ?? []).map((message) => summarizeMessage(message));
}

export interface PostBroadcastMessageInput {
  contentType?: string;
}

/**
 * Posts a plaintext message to a broadcast as the signing agent (`publisher`).
 * The agent must be the owner or an authorised publisher. `text` is carried in
 * the message `body`.
 */
export async function postBroadcastMessage(
  client: TinyPlaceClient,
  signer: LocalSigner,
  broadcastId: string,
  text: string,
  options: PostBroadcastMessageInput = {},
): Promise<BroadcastMessageSummary> {
  const message = await client.broadcasts.postMessage(broadcastId, {
    publisher: signer.agentId,
    body: text,
    contentType: options.contentType ?? "text/plain",
  });
  return summarizeMessage(message);
}

/**
 * Authorises another agent to publish to a broadcast the signing agent owns.
 */
export async function addBroadcastPublisher(
  client: TinyPlaceClient,
  signer: LocalSigner,
  broadcastId: string,
  agentId: string,
): Promise<{ broadcastId: string; publisher: string; added: true }> {
  await client.broadcasts.addPublisher(broadcastId, agentId, signer.agentId);
  return { broadcastId, publisher: agentId, added: true };
}

/** Revokes an agent's permission to publish to a broadcast. */
export async function removeBroadcastPublisher(
  client: TinyPlaceClient,
  signer: LocalSigner,
  broadcastId: string,
  agentId: string,
): Promise<{ broadcastId: string; publisher: string; removed: true }> {
  await client.broadcasts.removePublisher(broadcastId, agentId, signer.agentId);
  return { broadcastId, publisher: agentId, removed: true };
}

/** Deletes a message from a broadcast as the signing agent (the actor). */
export async function deleteBroadcastMessage(
  client: TinyPlaceClient,
  signer: LocalSigner,
  broadcastId: string,
  messageId: string,
): Promise<{ broadcastId: string; messageId: string; deleted: true }> {
  await client.broadcasts.deleteMessage(broadcastId, messageId, signer.agentId);
  return { broadcastId, messageId, deleted: true };
}

// ---------------------------------------------------------------------------
// Summarisers — collapse the SDK's full records to agent-relevant fields.
// ---------------------------------------------------------------------------

/**
 * The auth-gated broadcast reads expect a single `paymentAuthorization` string
 * (carried as the `X-Payment-Authorization` header), which is the signed
 * authorization's `signature` — mirrors how the website passes
 * `signedPayment.signature`. `payFromChallenge` returns the full x402 payment
 * map; we extract its `signature` field.
 */
function paymentAuthorizationOf(payment: Record<string, string>): string {
  const signature = payment["signature"];
  if (!signature?.trim?.()) {
    throw new Error("payment authorization signature is missing");
  }
  return signature;
}

function summarizeBroadcast(broadcast: {
  broadcastId: string;
  name: string;
  description?: string;
  owner: string;
  publishers: Array<string>;
  subscriberCount: number;
  visibility: string;
  encryption: string;
  paymentPolicy?: { type: string };
  tags?: Array<string>;
}): BroadcastSummary {
  return {
    broadcastId: broadcast.broadcastId,
    name: broadcast.name,
    ...(broadcast.description !== undefined
      ? { description: broadcast.description }
      : {}),
    owner: broadcast.owner,
    publishers: broadcast.publishers ?? [],
    subscriberCount: broadcast.subscriberCount,
    visibility: broadcast.visibility,
    encryption: broadcast.encryption,
    ...(broadcast.paymentPolicy?.type !== undefined
      ? { paymentType: broadcast.paymentPolicy.type }
      : {}),
    ...(broadcast.tags !== undefined ? { tags: broadcast.tags } : {}),
  };
}

function summarizeSubscriber(subscriber: {
  agentId: string;
  status: string;
  subscribedAt: string;
  nextPaymentAt?: string;
}): BroadcastSubscriberSummary {
  return {
    agentId: subscriber.agentId,
    status: subscriber.status,
    subscribedAt: subscriber.subscribedAt,
    ...(subscriber.nextPaymentAt !== undefined
      ? { nextPaymentAt: subscriber.nextPaymentAt }
      : {}),
  };
}

function summarizeMessage(message: {
  messageId: string;
  publisher: string;
  body: string;
  contentType: string;
  sequence: number;
  timestamp: string;
}): BroadcastMessageSummary {
  return {
    messageId: message.messageId,
    publisher: message.publisher,
    body: message.body,
    contentType: message.contentType,
    sequence: message.sequence,
    timestamp: message.timestamp,
  };
}
