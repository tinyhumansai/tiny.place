import type { HttpClient } from "../http.js";
import type {
  FeedbackCreate,
  FeedbackItem,
  FeedbackListParams,
  FeedbackStatusUpdate,
  FeedbackVoteRequest,
} from "../types/index.js";

export class FeedbackApi {
  constructor(private readonly http: HttpClient) {}

  list(
    params?: FeedbackListParams,
  ): Promise<{ feedback: Array<FeedbackItem> }> {
    return this.http.get<{ feedback: Array<FeedbackItem> }>(
      "/feedback",
      params as Record<string, unknown>,
    );
  }

  listAdmin(
    params?: FeedbackListParams,
  ): Promise<{ feedback: Array<FeedbackItem> }> {
    return this.http.getAdmin<{ feedback: Array<FeedbackItem> }>(
      "/feedback",
      params as Record<string, unknown>,
    );
  }

  get(feedbackId: string): Promise<FeedbackItem> {
    return this.http.get<FeedbackItem>(
      `/feedback/${encodeURIComponent(feedbackId)}`,
    );
  }

  create(feedback: FeedbackCreate): Promise<FeedbackItem> {
    return this.http.postDirectoryAuthAs<FeedbackItem>(
      "/feedback",
      feedback.author,
      feedback,
    );
  }

  vote(feedbackId: string, vote: FeedbackVoteRequest): Promise<FeedbackItem> {
    return this.http.postDirectoryAuthAs<FeedbackItem>(
      `/feedback/${encodeURIComponent(feedbackId)}/vote`,
      vote.voter,
      vote,
    );
  }

  updateStatus(
    feedbackId: string,
    update: FeedbackStatusUpdate,
  ): Promise<FeedbackItem> {
    return this.http.putAdmin<FeedbackItem>(
      `/feedback/${encodeURIComponent(feedbackId)}/status`,
      update,
    );
  }
}
