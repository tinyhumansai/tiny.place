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
import { listField } from "../safe.js";

export class AdminApi {
  constructor(private readonly http: HttpClient) {}

  // --- Fee Configuration ---

  listFees(): Promise<{ fees: Array<FeeConfig> }> {
    return this.http
      .getAdmin<{ fees: Array<FeeConfig> | null }>("/admin/fees")
      .then((result) => ({ fees: listField<FeeConfig>(result, "fees") }));
  }

  createFee(fee: Partial<FeeConfig>): Promise<FeeConfig> {
    return this.http.postAdmin<FeeConfig>("/admin/fees", fee);
  }

  getFee(feeId: string): Promise<FeeConfig> {
    return this.http.getAdmin<FeeConfig>(
      `/admin/fees/${encodeURIComponent(feeId)}`,
    );
  }

  updateFee(feeId: string, update: Partial<FeeConfig>): Promise<FeeConfig> {
    return this.http.putAdmin<FeeConfig>(
      `/admin/fees/${encodeURIComponent(feeId)}`,
      update,
    );
  }

  deleteFee(feeId: string): Promise<void> {
    return this.http.deleteAdmin<void>(
      `/admin/fees/${encodeURIComponent(feeId)}`,
    );
  }

  resolveFee(params: FeeResolveParams): Promise<FeeResolveResponse> {
    return this.http.getAdmin<FeeResolveResponse>("/admin/fees/resolve", {
      from: params.from,
      to: params.to,
      type: params.type,
    });
  }

  // --- Agent Management ---

  getAgentStatus(agentId: string): Promise<AgentPaymentStatus> {
    return this.http.getAdmin<AgentPaymentStatus>(
      `/admin/agents/${encodeURIComponent(agentId)}/status`,
    );
  }

  suspendAgent(
    agentId: string,
    params: { until: string; reason: string },
  ): Promise<AgentPaymentStatus> {
    return this.http.postAdmin<AgentPaymentStatus>(
      `/admin/agents/${encodeURIComponent(agentId)}/suspend`,
      params,
    );
  }

  unsuspendAgent(agentId: string): Promise<AgentPaymentStatus> {
    return this.http.postAdmin<AgentPaymentStatus>(
      `/admin/agents/${encodeURIComponent(agentId)}/unsuspend`,
    );
  }

  flagAgent(
    agentId: string,
    params: Record<string, unknown>,
  ): Promise<AgentPaymentStatus> {
    return this.http.postAdmin<AgentPaymentStatus>(
      `/admin/agents/${encodeURIComponent(agentId)}/flag`,
      params,
    );
  }

  // --- System Config ---

  getConfig(): Promise<{ config: Record<string, string> }> {
    return this.http.getAdmin<{ config: Record<string, string> }>(
      "/admin/config",
    );
  }

  setConfig(key: string, value: string, reason?: string): Promise<SystemConfig> {
    return this.http.putAdmin<SystemConfig>(
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
    return this.http
      .getAdmin<{ audit: Array<AdminAuditEntry> | null }>(
        "/admin/audit",
        params as Record<string, unknown>,
      )
      .then((result) => ({ audit: listField<AdminAuditEntry>(result, "audit") }));
  }

  // --- Metrics ---

  feeMetrics(period?: string): Promise<AdminFeeMetrics> {
    return this.http.getAdmin<AdminFeeMetrics>("/admin/metrics/fees", {
      period,
    });
  }
}
