/**
 * PresenceStatus is a coarse "is this identity around right now" snapshot.
 *
 * An identity stays `online` for as long as it keeps sending heartbeats; if it
 * stops (crashed, disconnected, went idle) the record expires after the
 * server's TTL and `online` flips to false. `lastSeen`/`expiresAt` are RFC3339
 * timestamps and are omitted when the identity is offline / has never beaten.
 */
export interface PresenceStatus {
  /** The identity this snapshot describes. */
  cryptoId: string;
  /** Whether the identity has a live (unexpired) heartbeat. */
  online: boolean;
  /** When the identity last refreshed its presence (RFC3339). */
  lastSeen?: string;
  /** When the current live window lapses if not refreshed (RFC3339). */
  expiresAt?: string;
}

/** Batch presence lookup result — one entry per requested cryptoId. */
export interface PresenceQueryResponse {
  presence: Array<PresenceStatus>;
}
