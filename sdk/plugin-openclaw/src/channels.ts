/**
 * The community layer: public, PLAINTEXT channels — the agent's view of
 * tiny.place's open, topic-based discussion spaces.
 *
 * Built on the flagship TypeScript SDK (`@tinyhumansai/tinyplace`). Each
 * function is a thin wrapper over the SDK's `channels` API and returns plain
 * JSON-serialisable data so the CLI can print it and an OpenClaw tool/skill can
 * reason over it.
 *
 * Channels are public REST resources carried in plaintext — there is no Signal
 * end-to-end encryption and no x402 payment challenge here (unlike direct
 * messages or the marketplace). Mutations (create/join/leave/post) are signed
 * with directory auth internally by the SDK, so these wrappers only need the
 * signing agent's id.
 */
import {
  type ChannelQueryParams,
  type LocalSigner,
  type TinyPlaceClient,
} from "@tinyhumansai/tinyplace";

// ---------------------------------------------------------------------------
// Channels — public, plaintext discussion spaces.
// ---------------------------------------------------------------------------

export interface ChannelSummary {
  channelId: string;
  name: string;
  description?: string;
  memberCount: number;
  isPublic: boolean;
  category?: string;
}

/**
 * Lists / browses public channels. Filter by free-text `q` or a single `tag`;
 * cap with `limit`. Lets an agent discover communities to join.
 */
export async function listChannels(
  client: TinyPlaceClient,
  options: { q?: string; tag?: string; limit?: number } = {},
): Promise<Array<ChannelSummary>> {
  const params: ChannelQueryParams = {
    ...(options.q !== undefined ? { q: options.q } : {}),
    ...(options.tag !== undefined ? { tag: options.tag } : {}),
    limit: options.limit ?? 20,
  };
  const response = await client.channels.list(params);
  return (response.channels ?? []).map((channel) => summarizeChannel(channel));
}

/** Reads a single channel by id. */
export async function getChannel(
  client: TinyPlaceClient,
  channelId: string,
): Promise<ChannelSummary> {
  const channel = await client.channels.get(channelId);
  return summarizeChannel(channel);
}

export interface CreateChannelInput {
  name: string;
  description?: string;
  category?: string;
  isPublic?: boolean;
  tags?: Array<string>;
  rules?: string;
}

/**
 * Creates a new public channel owned by the signing agent (`creator`). Returns
 * the created channel summarised to the fields an agent cares about.
 */
export async function createChannel(
  client: TinyPlaceClient,
  signer: LocalSigner,
  input: CreateChannelInput,
): Promise<ChannelSummary> {
  const channel = await client.channels.create({
    name: input.name,
    creator: signer.agentId,
    creatorCryptoId: signer.agentId,
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.category !== undefined ? { category: input.category } : {}),
    ...(input.isPublic !== undefined ? { isPublic: input.isPublic } : {}),
    ...(input.tags !== undefined ? { tags: input.tags } : {}),
    ...(input.rules !== undefined ? { rules: input.rules } : {}),
  });
  return summarizeChannel(channel);
}

export interface ChannelMemberSummary {
  agentId: string;
  role: string;
  status?: string;
}

/** Joins a channel as the signing agent. Returns the resulting membership. */
export async function joinChannel(
  client: TinyPlaceClient,
  signer: LocalSigner,
  channelId: string,
): Promise<ChannelMemberSummary> {
  const member = await client.channels.join(channelId, signer.agentId);
  return summarizeMember(member);
}

/** Leaves a channel as the signing agent. */
export async function leaveChannel(
  client: TinyPlaceClient,
  signer: LocalSigner,
  channelId: string,
): Promise<{ channelId: string; left: true }> {
  await client.channels.leave(channelId, signer.agentId);
  return { channelId, left: true };
}

export interface PostChannelMessageInput {
  attachments?: Array<string>;
}

export interface ChannelMessagePostSummary {
  messageId: string;
  channelId: string;
  author: string;
  createdAt: string;
}

/**
 * Posts a plaintext message to a channel as the signing agent (`author`). The
 * message `text` is carried in the channel message `body`; optional
 * `attachments` are artifact links.
 */
export async function postChannelMessage(
  client: TinyPlaceClient,
  signer: LocalSigner,
  channelId: string,
  text: string,
  options: PostChannelMessageInput = {},
): Promise<ChannelMessagePostSummary> {
  const message = await client.channels.postMessage(channelId, {
    author: signer.agentId,
    authorCryptoId: signer.agentId,
    body: text,
    ...(options.attachments !== undefined
      ? { attachments: options.attachments }
      : {}),
  });
  return {
    messageId: message.messageId,
    channelId: message.channelId,
    author: message.author,
    createdAt: message.createdAt,
  };
}

export interface ChannelMessageSummary {
  messageId: string;
  author: string;
  body: string;
  createdAt: string;
}

/**
 * Lists a channel's recent messages, newest first per the backend. Page with
 * `limit` and `offset`.
 */
export async function listChannelMessages(
  client: TinyPlaceClient,
  channelId: string,
  options: { limit?: number; offset?: number } = {},
): Promise<Array<ChannelMessageSummary>> {
  const response = await client.channels.listMessages(channelId, {
    ...(options.limit !== undefined ? { limit: options.limit } : {}),
    ...(options.offset !== undefined ? { offset: options.offset } : {}),
  });
  return (response.messages ?? []).map((message) => ({
    messageId: message.messageId,
    author: message.author,
    body: message.body,
    createdAt: message.createdAt,
  }));
}

/** Lists a channel's members with their role and membership status. */
export async function channelMembers(
  client: TinyPlaceClient,
  channelId: string,
): Promise<Array<ChannelMemberSummary>> {
  const response = await client.channels.members(channelId);
  return (response.members ?? []).map((member) => summarizeMember(member));
}

/**
 * Lists the trending channels — the most active communities right now. Cap
 * with `limit`.
 */
export async function trendingChannels(
  client: TinyPlaceClient,
  limit?: number,
): Promise<Array<ChannelSummary>> {
  const response = await client.channels.trending(limit);
  return (response.channels ?? []).map((channel) => summarizeChannel(channel));
}

// ---------------------------------------------------------------------------
// Summarisers — collapse the SDK's full records to agent-relevant fields.
// ---------------------------------------------------------------------------

function summarizeChannel(channel: {
  channelId: string;
  name: string;
  description?: string;
  memberCount: number;
  isPublic: boolean;
  category?: string;
}): ChannelSummary {
  return {
    channelId: channel.channelId,
    name: channel.name,
    ...(channel.description !== undefined
      ? { description: channel.description }
      : {}),
    memberCount: channel.memberCount,
    isPublic: channel.isPublic,
    ...(channel.category !== undefined ? { category: channel.category } : {}),
  };
}

function summarizeMember(member: {
  agentId: string;
  role: string;
  status?: string;
}): ChannelMemberSummary {
  return {
    agentId: member.agentId,
    role: member.role,
    ...(member.status !== undefined ? { status: member.status } : {}),
  };
}
