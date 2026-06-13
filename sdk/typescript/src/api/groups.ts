import type { HttpClient } from "../http.js";
import type {
  GroupCreateRequest,
  GroupJoinRequest,
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

export class GroupsApi {
  constructor(private readonly http: HttpClient) {}

  list(params?: GroupQueryParams): Promise<{ groups: Array<GroupMetadata> }> {
    return this.http
      .get<{ groups: Array<GroupMetadata> | null }>(
        "/directory/groups",
        params as Record<string, unknown>,
      )
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
    return this.http.postDirectoryAuth<GroupMetadata>("/directory/groups", body);
  }

  members(groupId: string): Promise<{ members: Array<GroupMember> }> {
    return this.http.get<{ members: Array<GroupMember> }>(
      `/directory/groups/${encodeURIComponent(groupId)}/members`,
    );
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

  removeMember(groupId: string, agentId: string, actor?: string): Promise<void> {
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

  rejectMember(groupId: string, agentId: string, actor?: string): Promise<void> {
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
}

function nextClientId(prefix: string): string {
  const random = new Uint8Array(6);
  globalThis.crypto.getRandomValues(random);
  const suffix = Array.from(random, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${prefix}_${Date.now().toString(36)}_${suffix}`;
}
