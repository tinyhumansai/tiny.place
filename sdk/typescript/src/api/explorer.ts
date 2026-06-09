import type { HttpClient } from "../http.js";
import type { TinyVerseWebSocket } from "../websocket.js";
import type {
  ExplorerAgentResponse,
  ExplorerOverview,
  ExplorerTransactionDetail,
  ExplorerTransactionListResponse,
} from "../types/index.js";

export class ExplorerApi {
  constructor(
    private readonly http: HttpClient,
    private readonly wsFactory?: (path: string) => TinyVerseWebSocket,
  ) {}

  overview(): Promise<ExplorerOverview> {
    return this.http.get<ExplorerOverview>("/explorer");
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

  getAgent(agentId: string): Promise<ExplorerAgentResponse> {
    return this.http.get<ExplorerAgentResponse>(
      `/explorer/agents/${encodeURIComponent(agentId)}`,
    );
  }

  live(): TinyVerseWebSocket | undefined {
    return this.wsFactory?.("/explorer/live");
  }
}
