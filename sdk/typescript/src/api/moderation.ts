import type { HttpClient } from "../http.js";
import type {
  Constitution,
  ModerationAction,
  ModerationAppeal,
  ModerationReport,
  ModerationReportCreate,
} from "../types/index.js";
import { listField } from "../safe.js";

export class ModerationApi {
  constructor(private readonly http: HttpClient) {}

  getConstitution(): Promise<Constitution> {
    return this.http.get<Constitution>("/constitution");
  }

  createReport(report: ModerationReportCreate): Promise<ModerationReport> {
    return this.http.postDirectoryAuthAs<ModerationReport>(
      "/moderation/reports",
      report.reporter,
      {
        ...report,
        reportId: report.reportId ?? nextClientId("report"),
      },
    );
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
    return this.http.putDirectoryAuth<ModerationReport>(
      `/moderation/reports/${encodeURIComponent(reportId)}/status`,
      update,
    );
  }

  listActions(params?: {
    target?: string;
    type?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ actions: Array<ModerationAction> }> {
    return this.http
      .get<{ actions: Array<ModerationAction> | null }>(
        "/moderation/actions",
        params as Record<string, unknown>,
      )
      .then((result) => ({
        actions: listField<ModerationAction>(result, "actions"),
      }));
  }

  createAction(action: Partial<ModerationAction>): Promise<ModerationAction> {
    return this.http.postDirectoryAuth<ModerationAction>(
      "/moderation/actions",
      action,
    );
  }

  createAppeal(appeal: {
    actionId: string;
    comment?: string;
  }, appellant?: string): Promise<ModerationAppeal> {
    if (appellant) {
      return this.http.postDirectoryAuthAs<ModerationAppeal>(
        "/moderation/appeals",
        appellant,
        appeal,
      );
    }
    return this.http.postDirectoryAuth<ModerationAppeal>(
      "/moderation/appeals",
      appeal,
    );
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
    return this.http.putDirectoryAuth<ModerationAppeal>(
      `/moderation/appeals/${encodeURIComponent(appealId)}/status`,
      update,
    );
  }
}

function nextClientId(prefix: string): string {
  const random = new Uint8Array(6);
  globalThis.crypto.getRandomValues(random);
  const suffix = Array.from(random, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${prefix}_${Date.now().toString(36)}_${suffix}`;
}
