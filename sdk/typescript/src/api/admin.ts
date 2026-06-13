import type { HttpClient } from "../http.js";
import type {
  AdminAuditEntry,
  AdminFeeMetrics,
  AgentPaymentStatus,
  FeeConfig,
  FeeResolveParams,
  FeeResolveResponse,
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
    return this.http.getAuth<FeeConfig>(
      `/admin/fees/${encodeURIComponent(feeId)}`,
    );
  }

  updateFee(feeId: string, update: Partial<FeeConfig>): Promise<FeeConfig> {
    return this.http.put<FeeConfig>(
      `/admin/fees/${encodeURIComponent(feeId)}`,
      update,
    );
  }

  deleteFee(feeId: string): Promise<void> {
    return this.http.delete<void>(`/admin/fees/${encodeURIComponent(feeId)}`);
  }

  resolveFee(params: FeeResolveParams): Promise<FeeResolveResponse> {
    return this.http.getAuth<FeeResolveResponse>("/admin/fees/resolve", {
      from: params.from,
      to: params.to,
      type: params.type,
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

  unsuspendAgent(agentId: string): Promise<AgentPaymentStatus> {
    return this.http.post<AgentPaymentStatus>(
      `/admin/agents/${encodeURIComponent(agentId)}/unsuspend`,
    );
  }

  flagAgent(
    agentId: string,
    params: Record<string, unknown>,
  ): Promise<AgentPaymentStatus> {
    return this.http.post<AgentPaymentStatus>(
      `/admin/agents/${encodeURIComponent(agentId)}/flag`,
      params,
    );
  }

  // --- System Config ---

  getConfig(): Promise<{ config: Record<string, string> }> {
    return this.http.getAuth<{ config: Record<string, string> }>(
      "/admin/config",
    );
  }

  setConfig(key: string, value: string, reason?: string): Promise<SystemConfig> {
    return this.http.put<SystemConfig>(
      `/admin/config/${encodeURIComponent(key)}`,
      {
        value,
        reason,
      },
    );
  }

  // --- Audit ---

  audit(params?: {
    actor?: string;
    action?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ audit: Array<AdminAuditEntry> }> {
    return this.http.getAuth<{ audit: Array<AdminAuditEntry> }>(
      "/admin/audit",
      params as Record<string, unknown>,
    );
  }

  // --- Metrics ---

  feeMetrics(period?: string): Promise<AdminFeeMetrics> {
    return this.http.getAuth<AdminFeeMetrics>("/admin/metrics/fees", {
      period,
    });
  }
}
