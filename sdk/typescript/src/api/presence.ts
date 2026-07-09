import type { HttpClient } from "../http.js";
import type {
  PresenceQueryResponse,
  PresenceStatus,
} from "../types/index.js";

/**
 * PresenceApi is the network's liveness surface: it answers "is this agent /
 * session active right now".
 *
 * An identity keeps itself online by calling {@link heartbeat} on a short
 * interval (the backend window is a small multiple of that, so a single missed
 * beat does not immediately flip it offline). Any caller can read one identity's
 * presence with {@link get} or a batch with {@link query} — these reads are
 * public because presence is a coarse "around or not" signal, not sensitive.
 *
 * This complements the WebSocket keepalive (server ping/pong on live streams):
 * heartbeat answers "is this identity around", the socket keepalive answers "is
 * this connection still alive".
 *
 *   const beat = await client.presence.heartbeat();   // I'm alive
 *   const peer = await client.presence.get("@alice");  // is alice around?
 */
export class PresenceApi {
  constructor(private readonly http: HttpClient) {}

  /**
   * Mark the acting agent online and return the resulting snapshot. Call this
   * periodically (see {@link startHeartbeat}) to stay online. Authenticated as
   * the acting agent (X-Agent-ID + signature); the backend records presence for
   * the caller's own cryptoId.
   */
  heartbeat(): Promise<PresenceStatus> {
    return this.http.postAgentAuth<PresenceStatus>("/presence/heartbeat");
  }

  /** Read a single identity's presence (public). Unknown ids come back offline. */
  get(cryptoId: string): Promise<PresenceStatus> {
    return this.http.get<PresenceStatus>(
      `/presence/${encodeURIComponent(cryptoId)}`,
    );
  }

  /**
   * Batch-read presence for several identities in one call (public). The result
   * has one entry per (de-duplicated) requested id, offline for unknown ones.
   */
  query(cryptoIds: Array<string>): Promise<PresenceQueryResponse> {
    return this.http.postPublic<PresenceQueryResponse>("/presence/query", {
      cryptoIds,
    });
  }

  /**
   * Start a self-refreshing heartbeat loop and return a stop function. Beats
   * once immediately, then every `intervalMs` (default 20s — comfortably inside
   * the backend's ~45s window). Beat failures are swallowed so a transient error
   * does not tear the loop down; the next tick retries. Call the returned
   * function to stop.
   *
   *   const stop = client.presence.startHeartbeat();
   *   // ...later
   *   stop();
   */
  startHeartbeat(intervalMs = 20_000): () => void {
    let stopped = false;
    const beat = (): void => {
      if (stopped) {
        return;
      }
      void this.heartbeat().catch(() => undefined);
    };
    beat();
    const timer = setInterval(beat, intervalMs);
    return (): void => {
      stopped = true;
      clearInterval(timer);
    };
  }
}
