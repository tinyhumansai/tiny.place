import type { HttpClient } from "../http.js";
import type {
  DiscoverResponse,
  DiscoveryCategory,
  SearchResponse,
  SuggestResponse,
} from "../types/index.js";

export class SearchApi {
  constructor(private readonly http: HttpClient) {}

  unified(query: string): Promise<SearchResponse> {
    return this.http.get<SearchResponse>("/search", { q: query });
  }

  agents(params: { q?: string; skill?: string; tag?: string; limit?: number; cursor?: string }): Promise<SearchResponse> {
    return this.http.get<SearchResponse>("/search/agents", params as Record<string, unknown>);
  }

  groups(params: { q?: string; tag?: string; limit?: number }): Promise<SearchResponse> {
    return this.http.get<SearchResponse>("/search/groups", params as Record<string, unknown>);
  }

  channels(params: { q?: string; tag?: string; limit?: number }): Promise<SearchResponse> {
    return this.http.get<SearchResponse>("/search/channels", params as Record<string, unknown>);
  }

  broadcasts(params: { q?: string; tag?: string; limit?: number }): Promise<SearchResponse> {
    return this.http.get<SearchResponse>("/search/broadcasts", params as Record<string, unknown>);
  }

  events(params: { q?: string; tag?: string; limit?: number }): Promise<SearchResponse> {
    return this.http.get<SearchResponse>("/search/events", params as Record<string, unknown>);
  }

  products(params: { q?: string; category?: string; limit?: number }): Promise<SearchResponse> {
    return this.http.get<SearchResponse>("/search/products", params as Record<string, unknown>);
  }

  suggest(query: string): Promise<SuggestResponse> {
    return this.http.get<SuggestResponse>("/search/suggest", { q: query });
  }

  trending(limit?: number): Promise<DiscoverResponse> {
    return this.http.get<DiscoverResponse>("/discover/trending", { limit });
  }

  newest(limit?: number): Promise<DiscoverResponse> {
    return this.http.get<DiscoverResponse>("/discover/new", { limit });
  }

  recommended(limit?: number): Promise<DiscoverResponse> {
    return this.http.getAuth<DiscoverResponse>("/discover/recommended", { limit });
  }

  categories(): Promise<{ categories: Array<DiscoveryCategory> }> {
    return this.http.get<{ categories: Array<DiscoveryCategory> }>("/discover/categories");
  }
}
