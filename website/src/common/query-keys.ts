import type {
	AgentQueryParams,
	ArtifactQueryParams,
	BroadcastQueryParams,
	ChannelQueryParams,
	EventQueryParams,
	EscrowQueryParams,
	GameRoomQueryParams,
	GroupQueryParams,
	IdentityListingQueryParams,
	InboxQueryParams,
	JobQueryParams,
	LotteryRoundQueryParams,
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
		polls: (eventId: string) => ["events", "polls", eventId] as const,
		questions: (eventId: string) => ["events", "questions", eventId] as const,
		recording: (eventId: string) => ["events", "recording", eventId] as const,
		series: () => ["events", "series"] as const,
		seriesDetail: (seriesId: string) => ["events", "series", seriesId] as const,
		stage: (eventId: string) => ["events", "stage", eventId] as const,
	},
	escrow: {
		list: (parameters?: EscrowQueryParams) =>
			["escrow", "list", parameters] as const,
		detail: (escrowId: string) => ["escrow", "detail", escrowId] as const,
		dispute: (escrowId: string) => ["escrow", "dispute", escrowId] as const,
	},
	jobs: {
		list: (parameters?: JobQueryParams) =>
			["jobs", "list", parameters] as const,
		detail: (jobId: string) => ["jobs", "detail", jobId] as const,
		proposals: (jobId: string) => ["jobs", "proposals", jobId] as const,
	},
	marketplace: {
		products: (parameters?: ProductQueryParams) =>
			["marketplace", "products", parameters] as const,
		product: (productId: string) =>
			["marketplace", "product", productId] as const,
		productDelivery: (
			productId: string,
			purchaseId: string,
			actorId?: string
		) =>
			[
				"marketplace",
				"product-delivery",
				productId,
				purchaseId,
				actorId,
			] as const,
		categories: () => ["marketplace", "categories"] as const,
		featured: () => ["marketplace", "featured"] as const,
		identityListings: () => ["marketplace", "identity-listings"] as const,
		identityHistory: (name: string) =>
			["marketplace", "identity-history", name] as const,
		identityBids: (listingId: string) =>
			["marketplace", "identity-bids", listingId] as const,
		identityFloor: (length: number) =>
			["marketplace", "identity-floor", length] as const,
		identityRecent: () => ["marketplace", "identity-recent"] as const,
		identityOffers: () => ["marketplace", "identity-offers"] as const,
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
	users: {
		detail: (cryptoId: string) => ["users", "detail", cryptoId] as const,
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
		history: (agentId: string) => ["reputation", "history", agentId] as const,
		trustGraph: (limit?: number) =>
			["reputation", "trust-graph", limit] as const,
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
	feedback: {
		list: (parameters?: { limit?: number; offset?: number; status?: string }) =>
			["feedback", "list", parameters] as const,
		adminList: (parameters?: {
			limit?: number;
			offset?: number;
			status?: string;
		}) => ["feedback", "admin-list", parameters] as const,
		detail: (feedbackId: string) => ["feedback", "detail", feedbackId] as const,
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
		subscription: (subscriptionId: string) =>
			["payments", "subscription", subscriptionId] as const,
		walletBalances: (wallet: string) =>
			["payments", "wallet-balances", wallet] as const,
	},
	pricing: {
		quote: (parameters: { base: string; network?: string; quote: string }) =>
			["pricing", "quote", parameters] as const,
		assets: () => ["pricing", "assets"] as const,
		pairs: () => ["pricing", "pairs"] as const,
		networks: () => ["pricing", "networks"] as const,
		gas: (network: string) => ["pricing", "gas", network] as const,
	},
	rooms: {
		list: (parameters?: GameRoomQueryParams) =>
			["rooms", "list", parameters] as const,
		detail: (roomId: string, actorId?: string) =>
			["rooms", "detail", roomId, actorId] as const,
		hands: (roomId: string, actorId?: string) =>
			["rooms", "hands", roomId, actorId] as const,
		hand: (roomId: string, handId: string, actorId?: string) =>
			["rooms", "hand", roomId, handId, actorId] as const,
		collusion: (roomId: string) => ["rooms", "collusion", roomId] as const,
	},
	lottery: {
		current: (actorId?: string) => ["lottery", "current", actorId] as const,
		rounds: (parameters?: LotteryRoundQueryParams) =>
			["lottery", "rounds", parameters] as const,
		round: (roundId: string) => ["lottery", "round", roundId] as const,
		holdings: (actorId?: string) => ["lottery", "holdings", actorId] as const,
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
