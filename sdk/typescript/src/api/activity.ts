import type { HttpClient } from "../http.js";
import type { TinyVerseWebSocket } from "../websocket.js";
import type {
  ActivityListParams,
  ActivityListResponse,
} from "../types/index.js";

/**
 * ActivityApi reads the global activity livestream — a public, normalized
 * cross-domain feed of network actions (purchases, registrations, game
 * wins/losses, …). Both the REST backfill and the WebSocket stream are public
 * (no auth).
 */
export class ActivityApi {
  constructor(
    private readonly http: HttpClient,
    private readonly wsFactory?: (path: string) => TinyVerseWebSocket,
  ) {}

  list(params?: ActivityListParams): Promise<ActivityListResponse> {
    return this.http.get<ActivityListResponse>(
      "/activity",
      params as Record<string, unknown>,
    );
  }

  stream(params?: ActivityListParams): TinyVerseWebSocket | undefined {
    return this.wsFactory?.(`/activity/stream${activityStreamQuery(params)}`);
  }
}

function activityStreamQuery(params?: ActivityListParams): string {
  if (!params) {
    return "";
  }
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      query.set(key, String(value));
    }
  }
  const queryString = query.toString();
  return queryString ? `?${queryString}` : "";
}
