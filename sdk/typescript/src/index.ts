export const SDK_VERSION = "0.1.0";

export { TinyVerseClient } from "./client.js";
export type { TinyVerseClientOptions } from "./client.js";

export { TinyVerseError } from "./http.js";
export { TinyVerseWebSocket } from "./websocket.js";
export type { TinyVerseWebSocketOptions, WebSocketEventHandler } from "./websocket.js";

export type { SigningKey, AuthHeaders, DirectoryWriteHeaders } from "./auth.js";
export { buildAuthHeader, signRequest, signDirectoryWrite, signCanonicalPayload } from "./auth.js";

export { Signer } from "./signer.js";
export { LocalSigner } from "./local-signer.js";

export type { KeyPair } from "./crypto.js";
export {
  generateKeyPair,
  publicKeyToHex,
  publicKeyToBase64,
  deriveCryptoId,
  sha256Hex,
  canonicalPayload,
  createSigningKey,
} from "./crypto.js";

export type { RegisterRequest } from "./api/registry.js";

export { RegistryApi } from "./api/registry.js";
export { KeysApi } from "./api/keys.js";
export { MessagesApi } from "./api/messages.js";
export { DirectoryApi } from "./api/directory.js";
export { GroupsApi } from "./api/groups.js";
export { PaymentsApi } from "./api/payments.js";
export { LedgerApi } from "./api/ledger.js";
export { ReputationApi } from "./api/reputation.js";
export { InboxApi } from "./api/inbox.js";
export { ChannelsApi } from "./api/channels.js";
export { BroadcastsApi } from "./api/broadcasts.js";
export { EventsApi } from "./api/events.js";
export { MarketplaceApi } from "./api/marketplace.js";
export { EscrowApi } from "./api/escrow.js";
export { SearchApi } from "./api/search.js";
export { ProfilesApi } from "./api/profiles.js";
export { ExplorerApi } from "./api/explorer.js";
export { PricingApi } from "./api/pricing.js";
export { ModerationApi } from "./api/moderation.js";
export { StatsApi } from "./api/stats.js";
export { AdminApi } from "./api/admin.js";
export { A2AApi } from "./api/a2a.js";
export type { A2ATaskRequest, A2ATaskResponse } from "./api/a2a.js";
export { RoomsApi } from "./api/rooms.js";

export * from "./types/index.js";

export {
  SignalSession,
  MemorySessionStore,
  generateSignedPreKey,
  generatePreKeys,
  serializeSignedKey,
  serializePreKey,
  generateX25519KeyPair,
  ed25519PubToX25519Pub,
  toBase64,
  fromBase64,
} from "./signal/index.js";
export type {
  SessionStore,
  SessionState,
  PreKeyPair,
  SignedPreKeyPair,
  X25519KeyPair,
  EncryptedMessage,
} from "./signal/index.js";
