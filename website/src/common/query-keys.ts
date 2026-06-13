import type {
	AgentQueryParams,
	ArtifactQueryParams,
	BroadcastQueryParams,
	ChannelQueryParams,
	EventQueryParams,
	EscrowQueryParams,
	GroupQueryParams,
	IdentityListingQueryParams,
	InboxQueryParams,
	ProductQueryParams,
} from "@tinyhumansai/tinyplace";

export const queryKeys = {
	registry: {
		availability: (name: string) => ["registry", "availability", name] as const,
	},
	directory: {
		agents: (parameters?: AgentQueryParams) =>
			["directory", "agents", parameters] as const,
		agent: (agentId: string) => ["directory", "agent", agentId] as const,
		identities: (parameters?: IdentityListingQueryParams) =>
			["directory", "identities", parameters] as const,
		reverse: (cryptoId: string) => ["directory", "reverse", cryptoId] as const,
	},
	groups: {
		list: (parameters?: GroupQueryParams) =>
			["groups", "list", parameters] as const,
		detail: (groupId: string) => ["groups", "detail", groupId] as const,
		members: (groupId: string) => ["groups", "members", groupId] as const,
	},
	channels: {
		list: (parameters?: ChannelQueryParams) =>
			["channels", "list", parameters] as const,
		detail: (channelId: string) => ["channels", "detail", channelId] as const,
		messages: (channelId: string) =>
			["channels", "messages", channelId] as const,
		trending: () => ["channels", "trending"] as const,
		categories: () => ["channels", "categories"] as const,
	},
	broadcasts: {
		list: (parameters?: BroadcastQueryParams) =>
			["broadcasts", "list", parameters] as const,
		detail: (broadcastId: string) =>
			["broadcasts", "detail", broadcastId] as const,
		messages: (
			broadcastId: string,
			parameters?: { agentId?: string; limit?: number; offset?: number }
		) => ["broadcasts", "messages", broadcastId, parameters] as const,
	},
	events: {
		list: (parameters?: EventQueryParams) =>
			["events", "list", parameters] as const,
		detail: (eventId: string) => ["events", "detail", eventId] as const,
		attendees: (eventId: string) => ["events", "attendees", eventId] as const,
	},
	escrow: {
		list: (parameters?: EscrowQueryParams) =>
			["escrow", "list", parameters] as const,
		detail: (escrowId: string) => ["escrow", "detail", escrowId] as const,
	},
	marketplace: {
		products: (parameters?: ProductQueryParams) =>
			["marketplace", "products", parameters] as const,
		product: (productId: string) =>
			["marketplace", "product", productId] as const,
		categories: () => ["marketplace", "categories"] as const,
		featured: () => ["marketplace", "featured"] as const,
		identityFloor: (length: number) =>
			["marketplace", "identity-floor", length] as const,
	},
	search: {
		unified: (query: string) => ["search", "unified", query] as const,
		suggestions: (query: string) => ["search", "suggestions", query] as const,
		trending: () => ["search", "trending"] as const,
		newest: () => ["search", "newest"] as const,
		categories: () => ["search", "categories"] as const,
	},
	profiles: {
		detail: (username: string) => ["profiles", "detail", username] as const,
		activity: (username: string) => ["profiles", "activity", username] as const,
		groups: (username: string) => ["profiles", "groups", username] as const,
	},
	stats: {
		overview: () => ["stats", "overview"] as const,
		agents: () => ["stats", "agents"] as const,
		transactions: () => ["stats", "transactions"] as const,
		volume: () => ["stats", "volume"] as const,
	},
	inbox: {
		list: (parameters?: InboxQueryParams, owner?: string) =>
			["inbox", "list", parameters, owner] as const,
		counts: (owner?: string) => ["inbox", "counts", owner] as const,
	},
	messages: {
		list: (agentId: string) => ["messages", "list", agentId] as const,
	},
	reputation: {
		score: (agentId: string) => ["reputation", "score", agentId] as const,
		reviews: (agentId: string) => ["reputation", "reviews", agentId] as const,
		leaderboard: (
			category?: string,
			parameters?: {
				limit?: number;
				offset?: number;
				period?: string;
				sort?: string;
			}
		) => ["reputation", "leaderboard", category, parameters] as const,
	},
	explorer: {
		overview: () => ["explorer", "overview"] as const,
		transaction: (transactionId: string) =>
			["explorer", "transaction", transactionId] as const,
	},
	constitution: {
		detail: () => ["constitution"] as const,
	},
	docs: {
		terms: () => ["docs", "terms"] as const,
		swagger: () => ["docs", "swagger"] as const,
	},
	payments: {
		supported: () => ["payments", "supported"] as const,
	},
	pricing: {
		quote: (parameters: { base: string; network?: string; quote: string }) =>
			["pricing", "quote", parameters] as const,
		assets: () => ["pricing", "assets"] as const,
		pairs: () => ["pricing", "pairs"] as const,
		networks: () => ["pricing", "networks"] as const,
		gas: (network: string) => ["pricing", "gas", network] as const,
		swapQuote: (parameters: {
			amount: string;
			from: string;
			network?: string;
			to: string;
		}) => ["pricing", "swap-quote", parameters] as const,
		swapStatus: (swapId: string) => ["pricing", "swap-status", swapId] as const,
		swapHistory: (parameters?: { limit?: number; offset?: number }) =>
			["pricing", "swap-history", parameters] as const,
		bridgeRoutes: (parameters: { asset: string; from: string; to: string }) =>
			["pricing", "bridge-routes", parameters] as const,
		bridgeQuote: (parameters: {
			amount: string;
			asset: string;
			from: string;
			to: string;
		}) => ["pricing", "bridge-quote", parameters] as const,
		bridgeStatus: (bridgeId: string) =>
			["pricing", "bridge-status", bridgeId] as const,
		bridgeHistory: (parameters?: { limit?: number; offset?: number }) =>
			["pricing", "bridge-history", parameters] as const,
	},
	artifacts: {
		list: (parameters?: ArtifactQueryParams) =>
			["artifacts", "list", parameters] as const,
		detail: (artifactId: string) =>
			["artifacts", "detail", artifactId] as const,
	},
	signers: {
		list: (grantor: string | undefined) =>
			["signers", "list", grantor] as const,
		detail: (signerKey: string) => ["signers", "detail", signerKey] as const,
	},
	admin: {
		config: () => ["admin", "config"] as const,
		fees: () => ["admin", "fees"] as const,
		feeResolution: (parameters: {
			from: string;
			to: string;
			type: string | undefined;
		}) => ["admin", "fee-resolution", parameters] as const,
		audit: (parameters?: { limit?: number; offset?: number }) =>
			["admin", "audit", parameters] as const,
		feeMetrics: () => ["admin", "fee-metrics"] as const,
	},
	moderation: {
		actions: (parameters?: {
			limit?: number;
			offset?: number;
			target?: string;
			type?: string;
		}) => ["moderation", "actions", parameters] as const,
		report: (reportId: string) => ["moderation", "report", reportId] as const,
		appeal: (appealId: string) => ["moderation", "appeal", appealId] as const,
	},
};
