export { TinyPlaceClient } from "./client.js";
export type { TinyPlaceClientOptions } from "./client.js";

export { TinyPlaceError } from "./http.js";
export type {
  PaymentChallenge,
  PaymentRequiredChallenge,
  RetryOptions,
  TinyPlaceErrorJSON,
} from "./http.js";
export {
  classifyError,
  errorCode,
  ERROR_CODE_GUIDE,
  TINYPLACE_ERROR_CODES,
} from "./errors.js";
export type {
  ClassifiedError,
  ErrorCodeGuide,
  TinyPlaceErrorCode,
} from "./errors.js";
export {
  asArray,
  asBool,
  asNumber,
  asObject,
  asString,
  field,
  listField,
} from "./safe.js";
export { TinyPlaceValidationError } from "./validation.js";
export { TinyPlaceWebSocket } from "./websocket.js";
export type {
  TinyPlaceWebSocketOptions,
  WebSocketEventHandler,
} from "./websocket.js";

export type {
  AdminAuthHeaders,
  AdminSigningOptions,
  SigningKey,
  SiwsSigningKey,
  AuthHeaders,
  DirectoryWriteHeaders,
  OnboardGrantCredential,
} from "./auth.js";
export {
  buildAuthHeader,
  signAdminRequest,
  signRequest,
  signDirectoryWrite,
  signCanonicalPayload,
  signFreshCanonicalPayload,
  mintOnboardGrant,
  parseOnboardGrant,
} from "./auth.js";

export { Signer, identityPublicKey, signerPaymentMetadata } from "./signer.js";
export type { IdentityPublicKeySigner, X402MetadataSigner } from "./signer.js";
export { LocalSigner } from "./local-signer.js";

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
  buildDelegatedX402PaymentMap,
  buildPayerSignedDelegatedTx,
  DEFAULT_CONFIRMATION_POLLS,
  executeSolanaPayment,
  executeSolanaX402Payment,
  FACILITATOR_COMPUTE_UNIT_LIMIT,
  FACILITATOR_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS,
  isLikelyMintAddress,
  resolveSolanaAsset,
  solanaAssetSymbol,
  SOLANA_CASH_DECIMALS,
  SOLANA_CASH_MINT,
  SOLANA_COMPUTE_BUDGET_PROGRAM_ID,
  SOLANA_MAINNET_NETWORK,
  SOLANA_NATIVE_ASSET,
  SOLANA_NATIVE_DECIMALS,
  SOLANA_SYSTEM_PROGRAM_ID,
  SOLANA_TOKEN_PROGRAM_ID,
  SOLANA_USDC_MINT,
  SOLANA_WSOL_MINT,
} from "./solana.js";
export type {
  DelegatedX402PaymentMapOptions,
  PayerSignedDelegatedTxOptions,
  SolanaAssetInfo,
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
  cryptoIdToPublicKeyBase64,
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
  SolanaSettlementFailure,
  SolanaSettlementOptions,
  SolanaSettlementRecovery,
  SolanaSettlementRecoveryState,
  SolanaSettlementResult,
} from "./api/payments.js";
export { LedgerApi } from "./api/ledger.js";
export { ActivityApi } from "./api/activity.js";
export { ReputationApi } from "./api/reputation.js";
export { InboxApi } from "./api/inbox.js";
export { FeedsApi } from "./api/feeds.js";
export { GraphQLApi } from "./api/graphql.js";
export { OnboardApi } from "./api/onboard.js";
export type {
  OnboardHandoffGrant,
  OnboardHandoffToken,
} from "./api/onboard.js";
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
export { ProfilesApi } from "./api/profiles.js";
export { ExplorerApi } from "./api/explorer.js";
export { FeedbackApi } from "./api/feedback.js";
export { ContactsApi } from "./api/contacts.js";
export { FollowsApi } from "./api/follows.js";
export { PricingApi } from "./api/pricing.js";
export { SolanaApi, formatTokenAmount } from "./api/solana.js";
export type {
  AssetBalance,
  OnChainBalances,
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
  GroupSessionStore,
  SessionState,
  OwnSenderKeyEntry,
  PreKeyPair,
  SignedPreKeyPair,
  X25519KeyPair,
  EncryptedMessage,
  SenderKeyDistribution,
  SenderKeyMessage,
  SenderKeyOwnState,
  SenderKeyReceiverState,
} from "./signal/index.js";

export { EncryptionContext } from "./messaging/encryption.js";
export type { MessageCipher } from "./messaging/encryption.js";

export {
  GroupKeyManager,
  sendGroupMessage,
  fetchGroupInbox,
  groupSenderKeyId,
  parseSenderKeyId,
  encodeGroupKeyDistribution,
  parseGroupKeyDistribution,
  encodeGroupBody,
  decodeGroupBody,
  buildGroupEnvelope,
  isBackendHintEnvelope,
} from "./messaging/group.js";
export type {
  DecryptedGroupMessage,
  ParsedSenderKeyId,
  GroupKeyDistributionPayload,
} from "./messaging/group.js";

export {
  ENCRYPTION_PUBLIC_KEY_METADATA,
  resolveEncryptionAddress,
  lookupAgentByEncryptionKey,
  publishEncryptionKey,
} from "./messaging/discovery.js";
export type { ResolvedAgentIdentity } from "./messaging/discovery.js";

// High-level agent facade. The full surface (facade functions + result types) is
// available from `@tinyhumansai/tinyplace/agent`; the curated entrypoints below
// are re-exported from the root for convenience.
export { Agent, registerDefaultSessionStore } from "./agent/agent.js";
export type {
  AgentOptions,
  DefaultSessionStoreFactory,
} from "./agent/agent.js";
export {
  challengeOf,
  payFromChallenge,
  withAutoPayment,
} from "./agent/x402-auto.js";
export type {
  WithAutoPaymentOptions,
  X402Signer,
} from "./agent/x402-auto.js";
export type {
  AgentSigner,
  OnboardInput,
  OnboardResult,
  OnboardStep,
} from "./agent/index.js";
export { triageUpdates } from "./agent/attention.js";
export type {
  AttentionItem,
  AttentionKind,
  AttentionPriority,
  AttentionSuggestion,
  PollSnapshot,
} from "./agent/attention.js";
export {
  AGENT_CATALOG,
  CATALOG_VERSION,
  agentCatalog,
  describeOperation,
} from "./agent/catalog.js";
export type {
  AgentInputKind,
  AgentOperation,
  AgentOperationInput,
} from "./agent/catalog.js";
