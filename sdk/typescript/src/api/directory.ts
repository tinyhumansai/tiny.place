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
import {
  validateAgentCard,
  validateAgentQueryParams,
  validateExtendedAgentCard,
  validateIdentityListingQueryParams,
} from "../validation.js";
import { listField } from "../safe.js";

export class DirectoryApi {
  constructor(private readonly http: HttpClient) {}

  listAgents(params?: AgentQueryParams): Promise<{ agents: Array<AgentCard> }> {
    validateAgentQueryParams(params);
    return this.http
      .get<{ agents: Array<AgentCard> | null }>(
        "/directory/agents",
        params as Record<string, unknown>,
      )
      .then((result) => ({ agents: listField<AgentCard>(result, "agents") }));
  }

  getAgent(agentId: string): Promise<AgentCard> {
    return this.http.get<AgentCard>(
      `/directory/agents/${encodeURIComponent(agentId)}`,
    );
  }

  /**
   * Reverse-resolves the agent that advertises a given Signal encryption public
   * key (base64). Returns `undefined` when no agent advertises it. The match is
   * re-verified client-side, so this stays correct even against a backend that
   * doesn't yet support the `encryptionKey` filter (it just returns nothing
   * rather than a wrong card).
   */
  async findAgentByEncryptionKey(
    encryptionKey: string,
  ): Promise<AgentCard | undefined> {
    const { agents } = await this.listAgents({ encryptionKey, limit: 1 });
    return agents.find(
      (agent) =>
        agent.metadata?.encryptionPublicKey === encryptionKey ||
        agent.publicKey === encryptionKey,
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
    validateExtendedAgentCard({ ...card, agentId });
    return this.http.putDirectoryAuth<ExtendedAgentCard>(
      `/directory/agents/${encodeURIComponent(agentId)}/extended`,
      card,
    );
  }

  upsertAgent(agentId: string, card: AgentCard): Promise<AgentCard> {
    validateAgentCard({ ...card, agentId, cryptoId: card.cryptoId || agentId });
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
    validateIdentityListingQueryParams(params);
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
    validateAgentQueryParams(params);
    return this.http.get<AgentSearchResponse>(
      "/directory/skills",
      params as Record<string, unknown>,
    );
  }
}
