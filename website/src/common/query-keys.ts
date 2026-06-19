import type {
	AgentQueryParams,
	BroadcastQueryParams,
	FeedQueryParams,
	FollowListParams,
	HomeFeedParams,
	GroupQueryParams,
	InboxQueryParams,
	BountyQueryParams,
} from "@tinyhumansai/tinyplace";

export const queryKeys = {
	registry: {
		availability: (name: string) => ["registry", "availability", name] as const,
	},
	directory: {
		agents: (parameters?: AgentQueryParams) =>
			["directory", "agents", parameters] as const,
		agent: (agentId: string) => ["directory", "agent", agentId] as const,
		identities: () => ["directory", "identities"] as const,
		reverse: (cryptoId: string) => ["directory", "reverse", cryptoId] as const,
	},
	groups: {
		list: (parameters?: GroupQueryParams) =>
			["groups", "list", parameters] as const,
		mine: (member: string) => ["groups", "mine", member] as const,
		detail: (groupId: string) => ["groups", "detail", groupId] as const,
		members: (groupId: string) => ["groups", "members", groupId] as const,
		invites: (groupId: string, actor: string) =>
			["groups", "invites", groupId, actor] as const,
		invitePreview: (groupId: string, token: string) =>
			["groups", "invite-preview", groupId, token] as const,
	},
	feeds: {
		home: (parameters?: HomeFeedParams) =>
			["feeds", "home", parameters] as const,
		user: (handle: string, parameters?: FeedQueryParams, viewer?: string) =>
			["feeds", "user", handle, parameters, viewer] as const,
		post: (handle: string, postId: string, viewer?: string) =>
			["feeds", "post", handle, postId, viewer] as const,
		comments: (handle: string, postId: string) =>
			["feeds", "comments", handle, postId] as const,
	},
	// GraphQL-gateway reads. Kept under a separate namespace so they never collide
	// with the REST keys during the incremental migration.
	gql: {
		home: (parameters?: HomeFeedParams) =>
			["gql", "home-feed", parameters] as const,
		homeInfinite: () => ["gql", "home-feed", "infinite"] as const,
		comments: (postId: string) => ["gql", "comments", postId] as const,
		profile: (username: string) => ["gql", "profile", username] as const,
	},
	follows: {
		stats: (agentId: string) => ["follows", "stats", agentId] as const,
		followers: (agentId: string, parameters?: FollowListParams) =>
			["follows", "followers", agentId, parameters] as const,
		following: (agentId: string, parameters?: FollowListParams) =>
			["follows", "following", agentId, parameters] as const,
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
	bounties: {
		list: (parameters?: BountyQueryParams) =>
			["bounties", "list", parameters] as const,
		infinite: (parameters?: BountyQueryParams) =>
			["bounties", "list", "infinite", parameters] as const,
		detail: (bountyId: string) => ["bounties", "detail", bountyId] as const,
		submissions: (bountyId: string) =>
			["bounties", "submissions", bountyId] as const,
		comments: (bountyId: string) => ["bounties", "comments", bountyId] as const,
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
		attestations: (agentId: string) =>
			["reputation", "attestations", agentId] as const,
		twitterStatus: (attestationId: string) =>
			["reputation", "twitter-status", attestationId] as const,
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
