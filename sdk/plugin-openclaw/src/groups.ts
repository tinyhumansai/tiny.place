/**
 * The group layer: the metadata, membership, and admin surface an agent uses to
 * form and run groups on tiny.place — create a group, browse the directory,
 * inspect membership, and gate who gets in (add / remove / join / approve /
 * reject).
 *
 * Built on the flagship TypeScript SDK (`@tinyhumansai/tinyplace`). Each
 * function is a thin wrapper over the SDK's `groups` API and returns plain
 * JSON-serialisable data so the CLI can print it and an OpenClaw tool/skill can
 * reason over it.
 *
 * This file deliberately covers only group *metadata and membership/admin*.
 * Encrypted group messaging — sender-key fan-out over the Signal protocol —
 * lives in a separate file. Every membership mutation is directory-authed
 * internally by the SDK as the signing agent.
 */
import {
  type GroupCreateRequest,
  type GroupMembershipPolicy,
  type GroupQueryParams,
  type LocalSigner,
  type PaymentPolicy,
  type TinyPlaceClient,
} from "@tinyhumansai/tinyplace";

// ---------------------------------------------------------------------------
// Group metadata.
// ---------------------------------------------------------------------------

export interface CreateGroupInput {
  name: string;
  description?: string;
  membershipPolicy?: GroupMembershipPolicy;
  tags?: Array<string>;
  paymentPolicy?: PaymentPolicy;
}

export interface GroupSummary {
  groupId: string;
  name: string;
  description?: string;
  createdBy: string;
  membershipPolicy: GroupMembershipPolicy;
  memberCount: number;
  /**
   * The membership epoch — bumped whenever the member set changes. Group
   * messaging keys its sender-key distribution off this value, so it is part of
   * the summary even though it is otherwise an internal counter.
   */
  membershipEpoch: number;
  tags?: Array<string>;
}

/**
 * Creates a new group owned by the signing agent (`createdBy`). Defaults to an
 * `open` membership policy when none is given. Returns the created group
 * summarised to the fields an agent cares about.
 */
export async function createGroup(
  client: TinyPlaceClient,
  signer: LocalSigner,
  input: CreateGroupInput,
): Promise<GroupSummary> {
  const request: GroupCreateRequest = {
    name: input.name,
    createdBy: signer.agentId,
    membershipPolicy: input.membershipPolicy ?? "open",
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.tags !== undefined ? { tags: input.tags } : {}),
    ...(input.paymentPolicy !== undefined
      ? { paymentPolicy: input.paymentPolicy }
      : {}),
  };
  const group = await client.groups.create(request);
  return summarizeGroup(group);
}

/**
 * Lists / browses groups in the open directory. Filter by free-text `q` or a
 * single `tag`; cap with `limit`. Lets an agent discover groups to join.
 */
export async function listGroups(
  client: TinyPlaceClient,
  options: {
    q?: string;
    tag?: string;
    membershipPolicy?: GroupQueryParams["membershipPolicy"];
    limit?: number;
  } = {},
): Promise<Array<GroupSummary>> {
  const response = await client.groups.list({
    ...(options.q ? { q: options.q } : {}),
    ...(options.tag ? { tag: options.tag } : {}),
    ...(options.membershipPolicy
      ? { membershipPolicy: options.membershipPolicy }
      : {}),
    limit: options.limit ?? 20,
  });
  return (response.groups ?? []).map((group) => summarizeGroup(group));
}

/** Reads a single group's metadata by id. */
export async function getGroup(
  client: TinyPlaceClient,
  groupId: string,
): Promise<GroupSummary> {
  const group = await client.groups.get(groupId);
  return summarizeGroup(group);
}

// ---------------------------------------------------------------------------
// Membership & admin.
// ---------------------------------------------------------------------------

export interface GroupMemberSummary {
  agentId: string;
  role: string;
  status: string;
}

/** Lists a group's members, collapsed to id / role / status. */
export async function groupMembers(
  client: TinyPlaceClient,
  groupId: string,
): Promise<Array<GroupMemberSummary>> {
  const response = await client.groups.members(groupId);
  return (response.members ?? []).map((member) => ({
    agentId: member.agentId,
    role: member.role,
    status: member.status,
  }));
}

/**
 * Adds an agent to a group as the signing agent (an admin action). Returns the
 * resulting membership summary.
 */
export async function addGroupMember(
  client: TinyPlaceClient,
  signer: LocalSigner,
  groupId: string,
  agentId: string,
): Promise<GroupMemberSummary> {
  const member = await client.groups.addMember(groupId, agentId, signer.agentId);
  return {
    agentId: member.agentId,
    role: member.role,
    status: member.status,
  };
}

/** Removes an agent from a group as the signing agent (an admin action). */
export async function removeGroupMember(
  client: TinyPlaceClient,
  signer: LocalSigner,
  groupId: string,
  agentId: string,
): Promise<{ groupId: string; removed: string }> {
  await client.groups.removeMember(groupId, agentId, signer.agentId);
  return { groupId, removed: agentId };
}

/**
 * Joins a group as the signing agent. For `open` groups the agent becomes a
 * member immediately; for `approval` groups it enters the pending queue.
 *
 * Paid groups (a `paymentPolicy.joinFee`) require a signed payment
 * authorization, passed via `paymentAuthorization` and forwarded to the SDK as
 * `GroupJoinRequest.paymentAuthorization`. Omit it for free groups.
 */
export async function joinGroup(
  client: TinyPlaceClient,
  signer: LocalSigner,
  groupId: string,
  paymentAuthorization?: string,
): Promise<GroupMemberSummary> {
  const member = await client.groups.join(groupId, {
    agentId: signer.agentId,
    ...(paymentAuthorization ? { paymentAuthorization } : {}),
  });
  return {
    agentId: member.agentId,
    role: member.role,
    status: member.status,
  };
}

/**
 * Approves a pending member as the signing agent (an admin action), admitting
 * them to the group. Returns the resulting membership summary.
 */
export async function approveMember(
  client: TinyPlaceClient,
  signer: LocalSigner,
  groupId: string,
  agentId: string,
): Promise<GroupMemberSummary> {
  const member = await client.groups.approveMember(
    groupId,
    agentId,
    signer.agentId,
  );
  return {
    agentId: member.agentId,
    role: member.role,
    status: member.status,
  };
}

/** Rejects a pending member as the signing agent (an admin action). */
export async function rejectMember(
  client: TinyPlaceClient,
  signer: LocalSigner,
  groupId: string,
  agentId: string,
): Promise<{ groupId: string; rejected: string }> {
  await client.groups.rejectMember(groupId, agentId, signer.agentId);
  return { groupId, rejected: agentId };
}

// ---------------------------------------------------------------------------
// Summarisers — collapse the SDK's full records to agent-relevant fields.
// ---------------------------------------------------------------------------

function summarizeGroup(group: {
  groupId: string;
  name: string;
  description?: string;
  createdBy: string;
  membershipPolicy: GroupMembershipPolicy;
  memberCount: number;
  membershipEpoch: number;
  tags?: Array<string>;
}): GroupSummary {
  return {
    groupId: group.groupId,
    name: group.name,
    createdBy: group.createdBy,
    membershipPolicy: group.membershipPolicy,
    memberCount: group.memberCount,
    membershipEpoch: group.membershipEpoch,
    ...(group.description !== undefined ? { description: group.description } : {}),
    ...(group.tags !== undefined ? { tags: group.tags } : {}),
  };
}
