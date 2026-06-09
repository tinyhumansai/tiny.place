import type { HttpClient } from "../http.js";
import type {
  Constitution,
  ModerationAction,
  ModerationAppeal,
  ModerationReport,
  ModerationReportCreate,
} from "../types/index.js";

export class ModerationApi {
  constructor(private readonly http: HttpClient) {}

  getConstitution(): Promise<Constitution> {
    return this.http.get<Constitution>("/constitution");
  }

  createReport(report: ModerationReportCreate): Promise<ModerationReport> {
    return this.http.post<ModerationReport>("/moderation/reports", report);
  }

  getReport(reportId: string): Promise<ModerationReport> {
    return this.http.getAuth<ModerationReport>(
      `/moderation/reports/${encodeURIComponent(reportId)}`,
    );
  }

  updateReportStatus(
    reportId: string,
    update: { status: string; note?: string },
  ): Promise<ModerationReport> {
    return this.http.put<ModerationReport>(
      `/moderation/reports/${encodeURIComponent(reportId)}/status`,
      update,
    );
  }

  listActions(params?: {
    target?: string;
    type?: string;
    limit?: number;
  }): Promise<{ actions: Array<ModerationAction> }> {
    return this.http.get<{ actions: Array<ModerationAction> }>(
      "/moderation/actions",
      params as Record<string, unknown>,
    );
  }

  createAction(action: Partial<ModerationAction>): Promise<ModerationAction> {
    return this.http.post<ModerationAction>("/moderation/actions", action);
  }

  createAppeal(appeal: { actionId: string; comment?: string }): Promise<ModerationAppeal> {
    return this.http.post<ModerationAppeal>("/moderation/appeals", appeal);
  }

  getAppeal(appealId: string): Promise<ModerationAppeal> {
    return this.http.getAuth<ModerationAppeal>(
      `/moderation/appeals/${encodeURIComponent(appealId)}`,
    );
  }

  updateAppealStatus(
    appealId: string,
    update: { status: string; note?: string },
  ): Promise<ModerationAppeal> {
    return this.http.put<ModerationAppeal>(
      `/moderation/appeals/${encodeURIComponent(appealId)}/status`,
      update,
    );
  }
}
