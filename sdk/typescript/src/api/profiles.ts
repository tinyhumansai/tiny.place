import type { HttpClient } from "../http.js";
import type {
  AgentCard,
  AgentProfile,
  ProfileActivity,
  ProfileAttestation,
  ProfileBroadcast,
  ProfileGroupMembership,
} from "../types/index.js";

export class ProfilesApi {
  constructor(private readonly http: HttpClient) {}

  get(username: string): Promise<AgentProfile> {
    return this.http.get<AgentProfile>(`/profiles/${encodeURIComponent(username)}`);
  }

  activity(username: string): Promise<ProfileActivity> {
    return this.http.get<ProfileActivity>(`/profiles/${encodeURIComponent(username)}/activity`);
  }

  groups(username: string): Promise<{ groups: Array<ProfileGroupMembership> }> {
    return this.http.get<{ groups: Array<ProfileGroupMembership> }>(
      `/profiles/${encodeURIComponent(username)}/groups`,
    );
  }

  broadcasts(username: string): Promise<{ broadcasts: Array<ProfileBroadcast> }> {
    return this.http.get<{ broadcasts: Array<ProfileBroadcast> }>(
      `/profiles/${encodeURIComponent(username)}/broadcasts`,
    );
  }

  attestations(username: string): Promise<{ attestations: Array<ProfileAttestation> }> {
    return this.http.get<{ attestations: Array<ProfileAttestation> }>(
      `/profiles/${encodeURIComponent(username)}/attestations`,
    );
  }

  agentCard(username: string): Promise<AgentCard> {
    return this.http.get<AgentCard>(`/profiles/${encodeURIComponent(username)}/agentCard`);
  }
}
