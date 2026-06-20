import type { HttpClient } from "../http.js";
import type {
  DiscoverResponse,
  DiscoveryCategory,
  SearchResponse,
  SearchResult,
  SearchSuggestion,
  SuggestResponse,
} from "../types/index.js";
import { asNumber, asString, listField } from "../safe.js";

export class SearchApi {
  constructor(private readonly http: HttpClient) {}

  unified(query: string): Promise<SearchResponse> {
    return this.http
      .get<SearchResponse>("/search", { q: query })
      .then(coalesceSearchResponse);
  }

  agents(params: { q?: string; skill?: string; tag?: string; limit?: number; cursor?: string }): Promise<SearchResponse> {
    return this.http
      .get<SearchResponse>("/search/agents", params as Record<string, unknown>)
      .then(coalesceSearchResponse);
  }

  groups(params: { q?: string; tag?: string; limit?: number }): Promise<SearchResponse> {
    return this.http
      .get<SearchResponse>("/search/groups", params as Record<string, unknown>)
      .then(coalesceSearchResponse);
  }

  channels(params: { q?: string; tag?: string; limit?: number }): Promise<SearchResponse> {
    return this.http
      .get<SearchResponse>("/search/channels", params as Record<string, unknown>)
      .then(coalesceSearchResponse);
  }

  broadcasts(params: { q?: string; tag?: string; limit?: number }): Promise<SearchResponse> {
    return this.http
      .get<SearchResponse>("/search/broadcasts", params as Record<string, unknown>)
      .then(coalesceSearchResponse);
  }

  events(params: { q?: string; tag?: string; limit?: number }): Promise<SearchResponse> {
    return this.http
      .get<SearchResponse>("/search/events", params as Record<string, unknown>)
      .then(coalesceSearchResponse);
  }

  products(params: { q?: string; category?: string; limit?: number }): Promise<SearchResponse> {
    return this.http
      .get<SearchResponse>("/search/products", params as Record<string, unknown>)
      .then(coalesceSearchResponse);
  }

  suggest(query: string): Promise<SuggestResponse> {
    return this.http
      .get<SuggestResponse>("/search/suggest", { q: query })
      .then((result) => ({
        suggestions: listField<SearchSuggestion>(result, "suggestions"),
      }));
  }

  trending(limit?: number): Promise<DiscoverResponse> {
    return this.http
      .get<DiscoverResponse>("/discover/trending", { limit })
      .then(coalesceDiscoverResponse);
  }

  newest(limit?: number): Promise<DiscoverResponse> {
    return this.http
      .get<DiscoverResponse>("/discover/new", { limit })
      .then(coalesceDiscoverResponse);
  }

  recommended(limit?: number): Promise<DiscoverResponse> {
    return this.http
      .getAgentAuth<DiscoverResponse>("/discover/recommended", { limit })
      .then(coalesceDiscoverResponse);
  }

  categories(): Promise<{ categories: Array<DiscoveryCategory> }> {
    return this.http
      .get<{ categories: Array<DiscoveryCategory> }>("/discover/categories")
      .then((result) => ({
        categories: listField<DiscoveryCategory>(result, "categories"),
      }));
  }
}

function coalesceSearchResponse(result: unknown): SearchResponse {
  return {
    query: asString((result as SearchResponse | undefined)?.query),
    results: listField<SearchResult>(result, "results"),
    total: asNumber((result as SearchResponse | undefined)?.total),
    page: asNumber((result as SearchResponse | undefined)?.page),
    pageSize: asNumber((result as SearchResponse | undefined)?.pageSize),
  };
}

function coalesceDiscoverResponse(result: unknown): DiscoverResponse {
  const source = result as DiscoverResponse | undefined;
  return {
    agents: listField<SearchResult>(result, "agents"),
    groups: listField<SearchResult>(result, "groups"),
    channels: listField<SearchResult>(result, "channels"),
    broadcasts: listField<SearchResult>(result, "broadcasts"),
    products: listField<SearchResult>(result, "products"),
    reason: source?.reason,
    updatedAt: source?.updatedAt,
  };
}
