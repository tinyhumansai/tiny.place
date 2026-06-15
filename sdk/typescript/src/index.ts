export const SDK_VERSION = "0.1.0";

export { TinyPlaceClient } from "./client.js";
export type { TinyPlaceClientOptions } from "./client.js";

export { TinyPlaceError } from "./http.js";
export type { PaymentChallenge, PaymentRequiredChallenge } from "./http.js";
export { TinyPlaceWebSocket } from "./websocket.js";
export type {
  TinyPlaceWebSocketOptions,
  WebSocketEventHandler,
} from "./websocket.js";

export type {
  AdminAuthHeaders,
  AdminSigningOptions,
  SigningKey,
  AuthHeaders,
  DirectoryWriteHeaders,
} from "./auth.js";
export {
  buildAuthHeader,
  signAdminRequest,
  signRequest,
  signDirectoryWrite,
  signCanonicalPayload,
  signFreshCanonicalPayload,
} from "./auth.js";

export { Signer, identityPublicKey, signerPaymentMetadata } from "./signer.js";
export type { IdentityPublicKeySigner, X402MetadataSigner } from "./signer.js";
export { LocalSigner } from "./local-signer.js";
export { BrowserSessionSigner } from "./browser-session-signer.js";
export type {
  SessionApprovalRequest,
  BrowserSessionSignerOptions,
} from "./browser-session-signer.js";
export {
  loadSession,
  saveSession,
  clearSession,
  sessionIsFresh,
} from "./session-store.js";
export type { StoredSession } from "./session-store.js";

export type {
  X402Scheme,
  X402AuthorizationFields,
  X402Authorization,
  X402PaymentAuthorizationOptions,
  X402PaymentMapOptions,
  X402PaymentMap,
} from "./x402.js";
export {
  buildCanonicalMessage,
  buildX402PaymentAuthorization,
  buildX402PaymentMap,
  buildX402PaymentPayload,
  signX402Authorization,
  x402AuthorizationToPaymentMap,
  generateNonce,
} from "./x402.js";

export {
  DEFAULT_CONFIRMATION_POLLS,
  executeSolanaPayment,
  executeSolanaX402Payment,
  SOLANA_MAINNET_NETWORK,
  SOLANA_NATIVE_ASSET,
  SOLANA_NATIVE_DECIMALS,
  SOLANA_SYSTEM_PROGRAM_ID,
  SOLANA_TOKEN_PROGRAM_ID,
  SOLANA_USDC_MINT,
} from "./solana.js";
export type {
  SolanaPaymentExecution,
  SolanaPaymentExecutionOptions,
  SolanaX402PaymentExecution,
  SolanaX402PaymentExecutionOptions,
} from "./solana.js";

export type { KeyPair } from "./crypto.js";
export {
  generateKeyPair,
  publicKeyToHex,
  publicKeyToBase64,
  publicKeyToSolanaAddress,
  deriveCryptoId,
  sha256Hex,
  canonicalPayload,
  createSigningKey,
} from "./crypto.js";

export type {
  RegisterRequest,
  SolanaRegistrationFailure,
  SolanaRegistrationPaymentOptions,
  SolanaRegistrationProofOptions,
  SolanaRegistrationProofResult,
  SolanaRegistrationResult,
} from "./api/registry.js";

export { RegistryApi } from "./api/registry.js";
export { KeysApi } from "./api/keys.js";
export { MessagesApi } from "./api/messages.js";
export { McpApi } from "./api/mcp.js";
export { DirectoryApi } from "./api/directory.js";
export { GroupsApi } from "./api/groups.js";
export { PaymentsApi } from "./api/payments.js";
export type {
  SolanaSettlementOptions,
  SolanaSettlementResult,
} from "./api/payments.js";
export { LedgerApi } from "./api/ledger.js";
export { ActivityApi } from "./api/activity.js";
export { ReputationApi } from "./api/reputation.js";
export { InboxApi } from "./api/inbox.js";
export { ChannelsApi } from "./api/channels.js";
export { ConversationsApi } from "./api/conversations.js";
export { BroadcastsApi } from "./api/broadcasts.js";
export { EventsApi } from "./api/events.js";
export { MarketplaceApi } from "./api/marketplace.js";
export {
  compareAmount,
  fivePercentIncrement,
  minimumIdentityBid,
} from "./identity-bidding.js";
export type {
  IdentityBidPaymentOptions,
  IdentityBidPaymentResult,
  IdentitySolanaPurchaseOptions,
  IdentitySolanaPurchaseResult,
  IdentityOfferPaymentOptions,
  IdentityOfferPaymentResult,
  ProductSolanaPurchaseOptions,
  ProductSolanaPurchaseResult,
} from "./api/marketplace.js";
export { EscrowApi } from "./api/escrow.js";
export { SearchApi } from "./api/search.js";
export { SignersApi } from "./api/signers.js";
export { ProfilesApi } from "./api/profiles.js";
export { ExplorerApi } from "./api/explorer.js";
export { FeedbackApi } from "./api/feedback.js";
export { PricingApi } from "./api/pricing.js";
export { SolanaApi } from "./api/solana.js";
export type {
  SolanaChainInfo,
  SolanaRPCBatchResponse,
  SolanaRPCError,
  SolanaRPCID,
  SolanaRPCInfo,
  SolanaRPCRequest,
  SolanaRPCResponse,
} from "./api/solana.js";
export { ModerationApi } from "./api/moderation.js";
export { StatsApi } from "./api/stats.js";
export { AdminApi } from "./api/admin.js";
export { A2AApi } from "./api/a2a.js";
export type { A2ATaskRequest, A2ATaskResponse } from "./api/a2a.js";
export { RoomsApi } from "./api/rooms.js";
export { LotteryApi } from "./api/lottery.js";
export { ArtifactsApi } from "./api/artifacts.js";
export { DocsApi } from "./api/docs.js";

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
  GroupSenderKey,
  GroupSenderKeyReceiver,
} from "./signal/index.js";
export type {
  SessionStore,
  SessionState,
  PreKeyPair,
  SignedPreKeyPair,
  X25519KeyPair,
  EncryptedMessage,
  SenderKeyDistribution,
  SenderKeyMessage,
  SenderKeyOwnState,
  SenderKeyReceiverState,
} from "./signal/index.js";
