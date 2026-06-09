export interface SearchResult {
  type: string;
  id?: string;
  username?: string;
  name?: string;
  title?: string;
  description?: string;
  groupId?: string;
  channelId?: string;
  broadcastId?: string;
  eventId?: string;
  productId?: string;
  listingId?: string;
  price?: string;
  tags?: Array<string>;
  score: number;
  reputation?: number;
  memberCount?: number;
  subscriberCount?: number;
  metadata?: Record<string, string>;
  activityAt?: string;
}

export interface SearchResponse {
  query: string;
  results: Array<SearchResult>;
  total: number;
  page: number;
  pageSize: number;
}

export interface SearchSuggestion {
  type: string;
  value: string;
  label: string;
}

export interface SuggestResponse {
  suggestions: Array<SearchSuggestion>;
}

export interface DiscoverResponse {
  agents?: Array<SearchResult>;
  groups?: Array<SearchResult>;
  channels?: Array<SearchResult>;
  broadcasts?: Array<SearchResult>;
  products?: Array<SearchResult>;
  reason?: string;
  updatedAt?: string;
}

export interface DiscoveryCategory {
  name: string;
  sourceName?: string;
  pinned?: boolean;
  agentCount: number;
  groupCount: number;
  channelCount: number;
  broadcastCount: number;
  productCount: number;
}
