import type { HttpClient } from "../http.js";
import type {
  LedgerListParams,
  LedgerTransaction,
  LedgerVerifyRequest,
  LedgerVerifyResult,
} from "../types/index.js";

export class LedgerApi {
  constructor(private readonly http: HttpClient) {}

  list(params?: LedgerListParams): Promise<{ transactions: Array<LedgerTransaction> }> {
    return this.http.get<{ transactions: Array<LedgerTransaction> }>(
      "/ledger/transactions",
      params as Record<string, unknown>,
    );
  }

  get(txId: string): Promise<LedgerTransaction> {
    return this.http.get<LedgerTransaction>(
      `/ledger/transactions/${encodeURIComponent(txId)}`,
    );
  }

  verify(request: LedgerVerifyRequest): Promise<LedgerVerifyResult> {
    return this.http.postPublic<LedgerVerifyResult>("/ledger/verify", request);
  }
}
