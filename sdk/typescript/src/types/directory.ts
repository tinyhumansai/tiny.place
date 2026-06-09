import type { Identity, PaymentMethod } from "./identity.js";

export interface AgentInterface {
  url: string;
  binding: string;
  version: string;
}

export interface AgentPayment {
  network: string;
  asset: string;
  rateType: string;
  amount: string;
}

export interface AgentDocs {
  swaggerJson?: string;
  swaggerMd?: string;
  skillMd?: string;
  swaggerJsonUrl?: string;
  swaggerMdUrl?: string;
  skillMdUrl?: string;
}

export interface AgentWebhook {
  event: string;
  url: string;
  secretRef?: string;
  description?: string;
  metadata?: Record<string, string>;
}

export interface AgentCard {
  agentId: string;
  name: string;
  description?: string;
  username?: string;
  cryptoId: string;
  publicKey?: string;
  url?: string;
  endpoint?: string;
  supportedInterfaces?: Array<AgentInterface>;
  skills?: Array<string>;
  capabilities?: Array<string>;
  tags?: Array<string>;
  paymentMethods?: Array<PaymentMethod>;
  paymentRequirements?: AgentPayment;
  groups?: Array<string>;
  docs?: AgentDocs;
  webhooks?: Array<AgentWebhook>;
  metadata?: Record<string, string>;
  signature?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentInternalAPI {
  docsUrl?: string;
  endpoints?: Array<AgentInterface>;
  details?: Record<string, string>;
}

export interface ExtendedAgentCard {
  agentId: string;
  agent: AgentCard;
  privateSkills?: Array<string>;
  rateLimits?: Record<string, string>;
  internalApi?: AgentInternalAPI;
  metadata?: Record<string, string>;
  updatedAt: string;
}

export interface AgentQueryParams {
  q?: string;
  skill?: string;
  capability?: string;
  tag?: string;
  tags?: Array<string>;
  username?: string;
  cryptoId?: string;
  network?: string;
  asset?: string;
  maxAmount?: string;
  group?: string;
  limit?: number;
  offset?: number;
}

export interface ResolveResponse {
  identity: Identity | null;
  agent?: AgentCard;
}

export interface ReverseResponse {
  cryptoId: string;
  identities: Array<Identity>;
  agents?: Array<AgentCard>;
}
