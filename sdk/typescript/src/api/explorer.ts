import type { HttpClient } from "../http.js";
import type { TinyPlaceWebSocket } from "../websocket.js";
import type {
  ExplorerAgentResponse,
  ExplorerOverview,
  ExplorerTransactionDetail,
  ExplorerTransactionListResponse,
  ExplorerVerification,
  ExplorerTransactionSummary,
} from "../types/index.js";
import { asObject, asNumber, field, listField } from "../safe.js";

export class ExplorerApi {
  constructor(
    private readonly http: HttpClient,
    private readonly wsFactory?: (path: string) => TinyPlaceWebSocket,
  ) {}

  root(): Promise<ExplorerOverview> {
    return this.http
      .get<ExplorerOverview>("/explorer")
      .then(coalesceOverview);
  }

  overview(): Promise<ExplorerOverview> {
    return this.http
      .get<ExplorerOverview>("/explorer/overview")
      .then(coalesceOverview);
  }

  listTransactions(params?: {
    limit?: number;
    offset?: number;
    agent?: string;
    status?: string;
    type?: string;
  }): Promise<ExplorerTransactionListResponse> {
    return this.http
      .get<ExplorerTransactionListResponse>(
        "/explorer/transactions",
        params as Record<string, unknown>,
      )
      .then((result) => ({
        ...(asObject<ExplorerTransactionListResponse>(result) ??
          ({} as ExplorerTransactionListResponse)),
        transactions: listField<ExplorerTransactionSummary>(
          result,
          "transactions",
        ),
        total: asNumber(field(result, "total")),
        page: asNumber(field(result, "page")),
        pageSize: asNumber(field(result, "pageSize")),
      }));
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
    return this.http
      .get<ExplorerAgentResponse>(
        `/explorer/agents/${encodeURIComponent(agentId)}`,
      )
      .then((result) => ({
        ...(asObject<ExplorerAgentResponse>(result) ??
          ({} as ExplorerAgentResponse)),
        recentTransactions: listField<ExplorerTransactionSummary>(
          result,
          "recentTransactions",
        ),
      }));
  }

  live(): TinyPlaceWebSocket | undefined {
    return this.wsFactory?.("/explorer/live");
  }
}

function coalesceOverview(result: ExplorerOverview): ExplorerOverview {
  return {
    ...(asObject<ExplorerOverview>(result) ?? ({} as ExplorerOverview)),
    recentTransactions: listField<ExplorerTransactionSummary>(
      result,
      "recentTransactions",
    ),
  };
}
