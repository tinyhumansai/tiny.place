import type { HttpClient } from "../http.js";
import type {
  AgentCard,
  AgentSearchResponse,
  AgentQueryParams,
  DirectoryIdentityListingsResponse,
  ExtendedAgentCard,
  IdentityListingQueryParams,
  ResolveResponse,
  ReverseResponse,
} from "../types/index.js";

export class DirectoryApi {
  constructor(private readonly http: HttpClient) {}

  listAgents(params?: AgentQueryParams): Promise<{ agents: Array<AgentCard> }> {
    return this.http.get<{ agents: Array<AgentCard> }>(
      "/directory/agents",
      params as Record<string, unknown>,
    );
  }

  getAgent(agentId: string): Promise<AgentCard> {
    return this.http.get<AgentCard>(
      `/directory/agents/${encodeURIComponent(agentId)}`,
    );
  }

  getExtendedAgent(agentId: string): Promise<ExtendedAgentCard> {
    return this.http.getDirectoryAuth<ExtendedAgentCard>(
      `/directory/agents/${encodeURIComponent(agentId)}/extended`,
    );
  }

  upsertExtendedAgent(
    agentId: string,
    card: ExtendedAgentCard,
  ): Promise<ExtendedAgentCard> {
    return this.http.putDirectoryAuth<ExtendedAgentCard>(
      `/directory/agents/${encodeURIComponent(agentId)}/extended`,
      card,
    );
  }

  upsertAgent(agentId: string, card: AgentCard): Promise<AgentCard> {
    return this.http.putDirectoryAuth<AgentCard>(
      `/directory/agents/${encodeURIComponent(agentId)}`,
      card,
    );
  }

  deleteAgent(agentId: string): Promise<void> {
    return this.http.deleteDirectoryAuth<void>(
      `/directory/agents/${encodeURIComponent(agentId)}`,
    );
  }

  listIdentities(
    params?: IdentityListingQueryParams,
  ): Promise<DirectoryIdentityListingsResponse> {
    return this.http.get<DirectoryIdentityListingsResponse>(
      "/directory/identities",
      params as Record<string, unknown>,
    );
  }

  resolve(name: string): Promise<ResolveResponse> {
    return this.http.get<ResolveResponse>(
      `/directory/resolve/${encodeURIComponent(name)}`,
    );
  }

  reverse(cryptoId: string): Promise<ReverseResponse> {
    return this.http.get<ReverseResponse>(
      `/directory/reverse/${encodeURIComponent(cryptoId)}`,
    );
  }

  skills(params?: {
    q?: string;
    limit?: number;
    cursor?: string;
  }): Promise<AgentSearchResponse> {
    return this.http.get<AgentSearchResponse>(
      "/directory/skills",
      params as Record<string, unknown>,
    );
  }
}
