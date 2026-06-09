import type { HttpClient } from "../http.js";
import type {
  AgentCard,
  AgentQueryParams,
  ExtendedAgentCard,
  ResolveResponse,
  ReverseResponse,
} from "../types/index.js";

export class DirectoryApi {
  constructor(private readonly http: HttpClient) {}

  listAgents(params?: AgentQueryParams): Promise<{ agents: Array<AgentCard> }> {
    return this.http.get<{ agents: Array<AgentCard> }>("/directory/agents", params as Record<string, unknown>);
  }

  getAgent(agentId: string): Promise<AgentCard> {
    return this.http.get<AgentCard>(`/directory/agents/${encodeURIComponent(agentId)}`);
  }

  getExtendedAgent(agentId: string): Promise<ExtendedAgentCard> {
    return this.http.getAuth<ExtendedAgentCard>(
      `/directory/agents/${encodeURIComponent(agentId)}/extended`,
    );
  }

  upsertAgent(agentId: string, card: AgentCard): Promise<AgentCard> {
    return this.http.put<AgentCard>(
      `/directory/agents/${encodeURIComponent(agentId)}`,
      card,
    );
  }

  deleteAgent(agentId: string): Promise<void> {
    return this.http.delete<void>(`/directory/agents/${encodeURIComponent(agentId)}`);
  }

  resolve(name: string): Promise<ResolveResponse> {
    return this.http.get<ResolveResponse>(`/directory/resolve/${encodeURIComponent(name)}`);
  }

  reverse(cryptoId: string): Promise<ReverseResponse> {
    return this.http.get<ReverseResponse>(`/directory/reverse/${encodeURIComponent(cryptoId)}`);
  }
}
