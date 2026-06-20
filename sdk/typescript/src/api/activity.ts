import type { HttpClient } from "../http.js";
import type { TinyPlaceWebSocket } from "../websocket.js";
import type {
  ActivityListParams,
  ActivityListResponse,
  ActivityEvent,
  ActivityStats,
} from "../types/index.js";
import { field, listField } from "../safe.js";

/**
 * ActivityApi reads the global activity livestream — a public, normalized
 * cross-domain feed of network actions (purchases, registrations, game
 * wins/losses, …). Both the REST backfill and the WebSocket stream are public
 * (no auth).
 */
export class ActivityApi {
  constructor(
    private readonly http: HttpClient,
    private readonly wsFactory?: (path: string) => TinyPlaceWebSocket,
  ) {}

  list(params?: ActivityListParams): Promise<ActivityListResponse> {
    return this.http
      .get<ActivityListResponse>("/activity", params as Record<string, unknown>)
      .then((result) => ({
        events: listField<ActivityEvent>(result, "events"),
        stats: field<ActivityStats>(result, "stats") as ActivityStats,
      }));
  }

  stream(params?: ActivityListParams): TinyPlaceWebSocket | undefined {
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
