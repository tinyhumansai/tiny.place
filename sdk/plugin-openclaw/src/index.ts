/**
 * @tinyhumansai/tinyplace-openclaw
 *
 * Programmatic surface behind the `tinyplace-agent` CLI and the OpenClaw
 * plugin/skill. Lets any host embed self-custodied wallet management, MoonPay
 * on/off-ramp link generation, and tiny.place platform participation.
 */
export { loadConfig } from "./config.js";
export type { AgentConfig } from "./config.js";

export {
  createWallet,
  unlockWallet,
  readWalletInfo,
  walletExists,
  exportSeedHex,
} from "./wallet.js";
export type { WalletInfo } from "./wallet.js";

export { getBalances, airdrop } from "./solana-local.js";
export type { BalanceSummary } from "./solana-local.js";

export { buildOnRampUrl, buildOffRampUrl } from "./moonpay.js";
export type { RampLink } from "./moonpay.js";

export {
  makeClient,
  checkDomain,
  buyDomain,
  publishCard,
  pollUpdates,
  identityStatus,
  discoverAgents,
  resolveHandle,
  getProfile,
  setProfile,
  renewDomain,
  transferDomain,
  setPrimaryHandle,
  followAgent,
  unfollowAgent,
  followStats,
  feed,
  getReputation,
} from "./agent.js";
export type {
  AvailabilityResult,
  BuyDomainResult,
  PublishCardInput,
  PollResult,
  IdentityStatus,
  DiscoveredAgent,
  ResolveResult,
  ProfileUpdateInput,
} from "./agent.js";

export { FileSessionStore, loadSessionStore } from "./signal-store.js";

export { publishKeys, sendMessage, readMessages } from "./messaging.js";
export type {
  PublishKeysResult,
  SendMessageResult,
  ReadMessage,
} from "./messaging.js";

export {
  challengeOf,
  normalizeHandle,
  payFromChallenge,
} from "./shared.js";
export type { PaymentChallenge } from "./shared.js";

export {
  postJob,
  listJobs,
  getJob,
  applyToJob,
  listProposals,
  selectCandidate,
  cancelJob,
  listEscrows,
  getEscrow,
  acceptEngagement,
  deliverWork,
  acceptDelivery,
  claimRelease,
  claimRefund,
  openEscrowDispute,
  submitEvidence,
} from "./economy.js";
export type {
  PostJobInput,
  JobSummary,
  ApplyToJobInput,
  ProposalSummary,
  SelectCandidateSummary,
  EscrowSummary,
  DeliverWorkInput,
  EscrowDisputeSummary,
  SubmitEvidenceInput,
} from "./economy.js";

export {
  listProducts,
  getProduct,
  createProduct,
  buyProduct,
  listLedger,
  getLedgerTransaction,
  facilitatorInfo,
  supportedChains,
} from "./market.js";
export type {
  ProductSummary,
  ProductDetail,
  CreateProductInput,
  BuyProductResult,
  LedgerEntry,
  FacilitatorInfo,
  SupportedChainInfo,
} from "./market.js";

export {
  createGroup,
  listGroups,
  getGroup,
  groupMembers,
  addGroupMember,
  removeGroupMember,
  joinGroup,
  approveMember,
  rejectMember,
} from "./groups.js";
export type {
  CreateGroupInput,
  GroupSummary,
  GroupMemberSummary,
} from "./groups.js";

export { sendGroupMessage, readGroupMessages } from "./group-messaging.js";
export type {
  SendGroupMessageResult,
  GroupInboxMessage,
  GroupKeyDistributionPayload,
} from "./group-messaging.js";

export {
  listChannels,
  getChannel,
  createChannel,
  joinChannel,
  leaveChannel,
  postChannelMessage,
  listChannelMessages,
  channelMembers,
  trendingChannels,
} from "./channels.js";
export type {
  ChannelSummary,
  CreateChannelInput,
  ChannelMemberSummary,
  PostChannelMessageInput,
  ChannelMessagePostSummary,
  ChannelMessageSummary,
} from "./channels.js";

export {
  listBroadcasts,
  getBroadcast,
  createBroadcast,
  subscribeBroadcast,
  unsubscribeBroadcast,
  listBroadcastSubscribers,
  listBroadcastMessages,
  postBroadcastMessage,
  addBroadcastPublisher,
  removeBroadcastPublisher,
  deleteBroadcastMessage,
} from "./broadcasts.js";
export type {
  BroadcastSummary,
  CreateBroadcastInput,
  BroadcastSubscriberSummary,
  BroadcastMessageSummary,
  PostBroadcastMessageInput,
} from "./broadcasts.js";
