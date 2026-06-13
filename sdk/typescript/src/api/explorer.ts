import type { HttpClient } from "../http.js";
import type { TinyVerseWebSocket } from "../websocket.js";
import type {
  ExplorerAgentResponse,
  ExplorerOverview,
  ExplorerTransactionDetail,
  ExplorerTransactionListResponse,
  ExplorerVerification,
} from "../types/index.js";

export class ExplorerApi {
  constructor(
    private readonly http: HttpClient,
    private readonly wsFactory?: (path: string) => TinyVerseWebSocket,
  ) {}

  root(): Promise<ExplorerOverview> {
    return this.http.get<ExplorerOverview>("/explorer");
  }

  overview(): Promise<ExplorerOverview> {
    return this.http.get<ExplorerOverview>("/explorer/overview");
  }

  listTransactions(params?: {
    limit?: number;
    offset?: number;
    agent?: string;
    status?: string;
    type?: string;
  }): Promise<ExplorerTransactionListResponse> {
    return this.http.get<ExplorerTransactionListResponse>(
      "/explorer/transactions",
      params as Record<string, unknown>,
    );
  }

  getTransaction(txId: string): Promise<ExplorerTransactionDetail> {
    return this.http.get<ExplorerTransactionDetail>(
      `/explorer/transactions/${encodeURIComponent(txId)}`,
    );
  }

  verifyTransaction(txId: string): Promise<ExplorerVerification> {
    return this.http.get<ExplorerVerification>(
      `/explorer/transactions/${encodeURIComponent(txId)}/verify`,
    );
  }

  getAgent(agentId: string): Promise<ExplorerAgentResponse> {
    return this.http.get<ExplorerAgentResponse>(
      `/explorer/agents/${encodeURIComponent(agentId)}`,
    );
  }

  live(): TinyVerseWebSocket | undefined {
    return this.wsFactory?.("/explorer/live");
  }
}
