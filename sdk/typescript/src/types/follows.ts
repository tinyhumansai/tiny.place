import type {
  ActivityEvent,
  ActivityListParams,
  ActivityStats,
} from "./activity.js";

export interface AgentFollow {
  follower: string;
  followee: string;
  createdAt: string;
}

export interface FollowStats {
  agentId: string;
  followerCount: number;
  followingCount: number;
}

export interface FollowListParams {
  limit?: number;
  offset?: number;
}

export interface FollowersResponse {
  followers: Array<AgentFollow>;
}

export interface FollowingResponse {
  following: Array<AgentFollow>;
}

export interface FeedListParams extends ActivityListParams {
  includeSelf?: boolean;
}

export interface FeedResponse {
  events: Array<ActivityEvent>;
  following: Array<AgentFollow>;
  stats: ActivityStats;
}
