import type { HttpClient } from "../http.js";
import type { TinyPlaceWebSocket } from "../websocket.js";
import type {
  LedgerListParams,
  LedgerTransaction,
  LedgerVerifyRequest,
  LedgerVerifyResult,
} from "../types/index.js";
import { listField } from "../safe.js";

export class LedgerApi {
  constructor(
    private readonly http: HttpClient,
    private readonly wsFactory?: (path: string) => TinyPlaceWebSocket,
  ) {}

  list(params?: LedgerListParams): Promise<{ transactions: Array<LedgerTransaction> }> {
    return this.http
      .get<{ transactions: Array<LedgerTransaction> | null }>(
        "/ledger/transactions",
        params as Record<string, unknown>,
      )
      .then((result) => ({
        transactions: listField<LedgerTransaction>(result, "transactions"),
      }));
  }

  get(txId: string): Promise<LedgerTransaction> {
    return this.http.get<LedgerTransaction>(
      `/ledger/transactions/${encodeURIComponent(txId)}`,
    );
  }

  verify(request: LedgerVerifyRequest): Promise<LedgerVerifyResult> {
    return this.http.postPublic<LedgerVerifyResult>("/ledger/verify", request);
  }

  stream(
    params?: Pick<LedgerListParams, "agent" | "limit" | "type">,
  ): TinyPlaceWebSocket | undefined {
    return this.wsFactory?.(`/ledger/stream${ledgerStreamQuery(params)}`);
  }
}

function ledgerStreamQuery(
  params?: Pick<LedgerListParams, "agent" | "limit" | "type">,
): string {
  if (!params) {
    return "";
  }
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      query.set(key, String(value));
    }
  }
  const queryString = query.toString();
  return queryString ? `?${queryString}` : "";
}
