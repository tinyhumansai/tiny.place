import type { HttpClient } from "../http.js";
import type {
  GroupCreateRequest,
  GroupMember,
  GroupMetadata,
  GroupQueryParams,
} from "../types/index.js";

export class GroupsApi {
  constructor(private readonly http: HttpClient) {}

  list(params?: GroupQueryParams): Promise<{ groups: Array<GroupMetadata> }> {
    return this.http.get<{ groups: Array<GroupMetadata> }>(
      "/directory/groups",
      params as Record<string, unknown>,
    );
  }

  get(groupId: string): Promise<GroupMetadata> {
    return this.http.get<GroupMetadata>(`/directory/groups/${encodeURIComponent(groupId)}`);
  }

  create(request: GroupCreateRequest): Promise<GroupMetadata> {
    return this.http.post<GroupMetadata>("/directory/groups", request);
  }

  members(groupId: string): Promise<{ members: Array<GroupMember> }> {
    return this.http.get<{ members: Array<GroupMember> }>(
      `/directory/groups/${encodeURIComponent(groupId)}/members`,
    );
  }

  join(groupId: string): Promise<GroupMember> {
    return this.http.post<GroupMember>(
      `/directory/groups/${encodeURIComponent(groupId)}/join`,
    );
  }
}
