import type { HttpClient } from "../http.js";
import type {
  GroupCreateRequest,
  GroupInvite,
  GroupInviteCreateRequest,
  GroupInvitePreview,
  GroupJoinRequest,
  GroupMemberRole,
  GroupMessageFanoutRequest,
  GroupMessageFanoutResponse,
  GroupMember,
  GroupMetadata,
  GroupQueryParams,
  GroupRevenueShareRequest,
  GroupRevenueShareResponse,
  GroupSubscriptionEnforceResponse,
  GroupSubscriptionRenewRequest,
} from "../types/index.js";
import { listField } from "../safe.js";

export class GroupsApi {
  constructor(private readonly http: HttpClient) {}

  list(params?: GroupQueryParams): Promise<{ groups: Array<GroupMetadata> }> {
    return this.http
      .get<{
        groups: Array<GroupMetadata> | null;
      }>("/directory/groups", params as Record<string, unknown>)
      .then((result) => ({ groups: result.groups ?? [] }));
  }

  get(groupId: string): Promise<GroupMetadata> {
    return this.http.get<GroupMetadata>(
      `/directory/groups/${encodeURIComponent(groupId)}`,
    );
  }

  create(request: GroupCreateRequest): Promise<GroupMetadata> {
    const body = {
      ...request,
      groupId: request.groupId ?? nextClientId("grp"),
    };
    if (body.createdBy) {
      return this.http.postDirectoryAuthAs<GroupMetadata>(
        "/directory/groups",
        body.createdBy,
        body,
      );
    }
    return this.http.postDirectoryAuth<GroupMetadata>(
      "/directory/groups",
      body,
    );
  }

  members(groupId: string): Promise<{ members: Array<GroupMember> }> {
    return this.http
      .get<{ members: Array<GroupMember> | null }>(
        `/directory/groups/${encodeURIComponent(groupId)}/members`,
      )
      .then((result) => ({
        members: listField<GroupMember>(result, "members"),
      }));
  }

  addMember(
    groupId: string,
    agentId: string,
    actor?: string,
  ): Promise<GroupMember> {
    if (actor) {
      return this.http.postDirectoryAuthAs<GroupMember>(
        `/directory/groups/${encodeURIComponent(groupId)}/members`,
        actor,
        { agentId },
      );
    }
    return this.http.postDirectoryAuth<GroupMember>(
      `/directory/groups/${encodeURIComponent(groupId)}/members`,
      { agentId },
    );
  }

  removeMember(
    groupId: string,
    agentId: string,
    actor?: string,
  ): Promise<void> {
    if (actor) {
      return this.http.deleteDirectoryAuthAs<void>(
        `/directory/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(agentId)}`,
        actor,
        {},
      );
    }
    return this.http.deleteDirectoryAuth<void>(
      `/directory/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(agentId)}`,
      {},
    );
  }

  join(
    groupId: string,
    request?: GroupJoinRequest | string,
  ): Promise<GroupMember> {
    const body =
      typeof request === "string" ? { agentId: request } : (request ?? {});
    if (body.agentId) {
      return this.http.postDirectoryAuthAs<GroupMember>(
        `/directory/groups/${encodeURIComponent(groupId)}/join`,
        body.agentId,
        body,
      );
    }
    return this.http.postDirectoryAuth<GroupMember>(
      `/directory/groups/${encodeURIComponent(groupId)}/join`,
      body,
    );
  }

  approveMember(
    groupId: string,
    agentId: string,
    actor?: string,
  ): Promise<GroupMember> {
    if (actor) {
      return this.http.postDirectoryAuthAs<GroupMember>(
        `/directory/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(agentId)}/approve`,
        actor,
        {},
      );
    }
    return this.http.postDirectoryAuth<GroupMember>(
      `/directory/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(agentId)}/approve`,
      {},
    );
  }

  rejectMember(
    groupId: string,
    agentId: string,
    actor?: string,
  ): Promise<void> {
    if (actor) {
      return this.http.postDirectoryAuthAs<void>(
        `/directory/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(agentId)}/reject`,
        actor,
        {},
      );
    }
    return this.http.postDirectoryAuth<void>(
      `/directory/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(agentId)}/reject`,
      {},
    );
  }

  renewMemberSubscription(
    groupId: string,
    agentId: string,
    request?: GroupSubscriptionRenewRequest,
  ): Promise<GroupMember> {
    return this.http.postDirectoryAuthAs<GroupMember>(
      `/directory/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(agentId)}/subscription/renew`,
      agentId,
      request ?? {},
    );
  }

  setRevenueShares(
    groupId: string,
    request: GroupRevenueShareRequest,
    actor?: string,
  ): Promise<GroupRevenueShareResponse> {
    if (actor) {
      return this.http.postDirectoryAuthAs<GroupRevenueShareResponse>(
        `/directory/groups/${encodeURIComponent(groupId)}/revenue-shares`,
        actor,
        request,
      );
    }
    return this.http.postDirectoryAuth<GroupRevenueShareResponse>(
      `/directory/groups/${encodeURIComponent(groupId)}/revenue-shares`,
      request,
    );
  }

  enforceSubscriptions(
    groupId: string,
    request?: Record<string, unknown>,
    actor?: string,
  ): Promise<GroupSubscriptionEnforceResponse> {
    if (actor) {
      return this.http.postDirectoryAuthAs<GroupSubscriptionEnforceResponse>(
        `/directory/groups/${encodeURIComponent(groupId)}/subscriptions/enforce`,
        actor,
        request ?? {},
      );
    }
    return this.http.postDirectoryAuth<GroupSubscriptionEnforceResponse>(
      `/directory/groups/${encodeURIComponent(groupId)}/subscriptions/enforce`,
      request ?? {},
    );
  }

  fanoutMessage(
    groupId: string,
    message: GroupMessageFanoutRequest,
  ): Promise<GroupMessageFanoutResponse> {
    return this.http.postDirectoryAuthAs<GroupMessageFanoutResponse>(
      `/directory/groups/${encodeURIComponent(groupId)}/messages`,
      message.from,
      message,
    );
  }

  /**
   * Promotes or demotes an active member between "admin" and "member". Only
   * the group owner may change roles. Signed as the owner (or `actor`).
   */
  setMemberRole(
    groupId: string,
    agentId: string,
    role: GroupMemberRole,
    actor?: string,
  ): Promise<GroupMember> {
    const path = `/directory/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(agentId)}/role`;
    if (actor) {
      return this.http.postDirectoryAuthAs<GroupMember>(path, actor, { role });
    }
    return this.http.postDirectoryAuth<GroupMember>(path, { role });
  }

  /**
   * Issues (or rotates) the acting admin's invite link for a group. Each admin
   * holds at most one active invite per group. Signed as `actor` (an admin).
   */
  createInvite(
    groupId: string,
    actor: string,
    request?: GroupInviteCreateRequest,
  ): Promise<GroupInvite> {
    return this.http.postDirectoryAuthAs<GroupInvite>(
      `/directory/groups/${encodeURIComponent(groupId)}/invites`,
      actor,
      request ?? {},
    );
  }

  /** Lists the active invites for a group. Signed as `actor` (an admin). */
  listInvites(
    groupId: string,
    actor: string,
  ): Promise<{ invites: Array<GroupInvite> }> {
    return this.http
      .getDirectoryAuthAs<{
        invites: Array<GroupInvite> | null;
      }>(`/directory/groups/${encodeURIComponent(groupId)}/invites`, actor)
      .then((result) => ({ invites: result.invites ?? [] }));
  }

  /**
   * Returns a public preview of the group behind a valid invite token so an
   * invitee can see what they're joining before redeeming. No auth required.
   */
  previewInvite(groupId: string, token: string): Promise<GroupInvitePreview> {
    return this.http.get<GroupInvitePreview>(
      `/directory/groups/${encodeURIComponent(groupId)}/invites/${encodeURIComponent(token)}`,
    );
  }

  /**
   * Revokes an invite token. The owner may revoke any invite; an admin may
   * revoke only their own. Signed as `actor`.
   */
  revokeInvite(groupId: string, token: string, actor: string): Promise<void> {
    return this.http.deleteDirectoryAuthAs<void>(
      `/directory/groups/${encodeURIComponent(groupId)}/invites/${encodeURIComponent(token)}`,
      actor,
      {},
    );
  }

  /**
   * Redeems an invite token, adding the agent as an active member regardless
   * of the group's membership policy. Signed by the joining agent.
   */
  redeemInvite(
    groupId: string,
    token: string,
    agentId: string,
  ): Promise<GroupMember> {
    return this.http.postDirectoryAuthAs<GroupMember>(
      `/directory/groups/${encodeURIComponent(groupId)}/invites/${encodeURIComponent(token)}/redeem`,
      agentId,
      { agentId },
    );
  }
}

function nextClientId(prefix: string): string {
  const random = new Uint8Array(6);
  globalThis.crypto.getRandomValues(random);
  const suffix = Array.from(random, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${prefix}_${Date.now().toString(36)}_${suffix}`;
}
