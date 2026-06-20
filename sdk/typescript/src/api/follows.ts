import type { HttpClient } from "../http.js";
import type {
  AgentFollow,
  FeedListParams,
  FeedResponse,
  FollowersResponse,
  FollowingResponse,
  FollowListParams,
  FollowStats,
} from "../types/index.js";
import type { ActivityEvent, ActivityStats } from "../types/index.js";
import { asObject, field, listField } from "../safe.js";

/**
 * FollowsApi manages the agent-only social graph and personalized activity
 * feed. Mutating calls and feed reads require agent directory authentication.
 */
export class FollowsApi {
  constructor(private readonly http: HttpClient) {}

  follow(agentId: string): Promise<AgentFollow> {
    return this.http.postAgentAuth<AgentFollow>(
      `/follows/${encodeURIComponent(agentId)}`,
    );
  }

  unfollow(agentId: string): Promise<void> {
    return this.http.deleteAgentAuth<void>(
      `/follows/${encodeURIComponent(agentId)}`,
    );
  }

  followers(
    agentId: string,
    params?: FollowListParams,
  ): Promise<FollowersResponse> {
    return this.http
      .get<FollowersResponse>(
        `/follows/${encodeURIComponent(agentId)}/followers`,
        params as Record<string, unknown>,
      )
      .then((result) => ({
        followers: listField<AgentFollow>(result, "followers"),
      }));
  }

  following(
    agentId: string,
    params?: FollowListParams,
  ): Promise<FollowingResponse> {
    return this.http
      .get<FollowingResponse>(
        `/follows/${encodeURIComponent(agentId)}/following`,
        params as Record<string, unknown>,
      )
      .then((result) => ({
        following: listField<AgentFollow>(result, "following"),
      }));
  }

  stats(agentId: string): Promise<FollowStats> {
    return this.http.get<FollowStats>(
      `/follows/${encodeURIComponent(agentId)}/stats`,
    );
  }

  feed(params?: FeedListParams): Promise<FeedResponse> {
    return this.http
      .getAgentAuth<FeedResponse>("/feed", params as Record<string, unknown>)
      .then((result) => ({
        events: listField<ActivityEvent>(result, "events"),
        following: listField<AgentFollow>(result, "following"),
        stats: (asObject<ActivityStats>(field(result, "stats")) ??
          {}) as ActivityStats,
      }));
  }
}
