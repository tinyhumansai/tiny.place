import type { HttpClient } from "../http.js";
import type {
  AdminAuditEntry,
  AgentPaymentStatus,
  FeeConfig,
  SystemConfig,
} from "../types/index.js";

export class AdminApi {
  constructor(private readonly http: HttpClient) {}

  // --- Fee Configuration ---

  listFees(): Promise<{ fees: Array<FeeConfig> }> {
    return this.http.getAuth<{ fees: Array<FeeConfig> }>("/admin/fees");
  }

  createFee(fee: Partial<FeeConfig>): Promise<FeeConfig> {
    return this.http.post<FeeConfig>("/admin/fees", fee);
  }

  getFee(feeId: string): Promise<FeeConfig> {
    return this.http.getAuth<FeeConfig>(`/admin/fees/${encodeURIComponent(feeId)}`);
  }

  updateFee(feeId: string, update: Partial<FeeConfig>): Promise<FeeConfig> {
    return this.http.put<FeeConfig>(`/admin/fees/${encodeURIComponent(feeId)}`, update);
  }

  deleteFee(feeId: string): Promise<void> {
    return this.http.delete<void>(`/admin/fees/${encodeURIComponent(feeId)}`);
  }

  resolveFee(agent1: string, agent2: string): Promise<{ feeRate: string; resolved: boolean }> {
    return this.http.getAuth<{ feeRate: string; resolved: boolean }>("/admin/fees/resolve", {
      agent1,
      agent2,
    });
  }

  // --- Agent Management ---

  getAgentStatus(agentId: string): Promise<AgentPaymentStatus> {
    return this.http.getAuth<AgentPaymentStatus>(
      `/admin/agents/${encodeURIComponent(agentId)}/status`,
    );
  }

  suspendAgent(
    agentId: string,
    params: { until: string; reason: string },
  ): Promise<AgentPaymentStatus> {
    return this.http.post<AgentPaymentStatus>(
      `/admin/agents/${encodeURIComponent(agentId)}/suspend`,
      params,
    );
  }

  // --- System Config ---

  getConfig(): Promise<{ config: Record<string, string> }> {
    return this.http.getAuth<{ config: Record<string, string> }>("/admin/config");
  }

  setConfig(key: string, value: string): Promise<void> {
    return this.http.put<void>(`/admin/config/${encodeURIComponent(key)}`, { value });
  }

  // --- Audit ---

  audit(params?: {
    actor?: string;
    action?: string;
    limit?: number;
  }): Promise<{ records: Array<AdminAuditEntry> }> {
    return this.http.getAuth<{ records: Array<AdminAuditEntry> }>(
      "/admin/audit",
      params as Record<string, unknown>,
    );
  }

  // --- Metrics ---

  feeMetrics(period?: string): Promise<{
    revenue: string;
    byAgent: Record<string, string>;
    byAsset: Record<string, string>;
  }> {
    return this.http.getAuth<{
      revenue: string;
      byAgent: Record<string, string>;
      byAsset: Record<string, string>;
    }>("/admin/metrics/fees", { period });
  }
}
