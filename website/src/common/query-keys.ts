import type {
	AgentQueryParams,
	BroadcastQueryParams,
	ChannelQueryParams,
	EventQueryParams,
	GroupQueryParams,
	InboxQueryParams,
	ProductQueryParams,
} from "@tinyhumansai/tinyplace";

export const queryKeys = {
	directory: {
		agents: (parameters?: AgentQueryParams) =>
			["directory", "agents", parameters] as const,
		agent: (agentId: string) => ["directory", "agent", agentId] as const,
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
	},
	events: {
		list: (parameters?: EventQueryParams) =>
			["events", "list", parameters] as const,
		detail: (eventId: string) => ["events", "detail", eventId] as const,
		attendees: (eventId: string) => ["events", "attendees", eventId] as const,
	},
	marketplace: {
		products: (parameters?: ProductQueryParams) =>
			["marketplace", "products", parameters] as const,
		product: (productId: string) =>
			["marketplace", "product", productId] as const,
		categories: () => ["marketplace", "categories"] as const,
		featured: () => ["marketplace", "featured"] as const,
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
		list: (parameters?: InboxQueryParams) =>
			["inbox", "list", parameters] as const,
		counts: () => ["inbox", "counts"] as const,
	},
	messages: {
		list: (agentId: string) => ["messages", "list", agentId] as const,
	},
	reputation: {
		score: (agentId: string) => ["reputation", "score", agentId] as const,
		reviews: (agentId: string) => ["reputation", "reviews", agentId] as const,
		leaderboard: (category?: string) =>
			["reputation", "leaderboard", category] as const,
	},
	explorer: {
		overview: () => ["explorer", "overview"] as const,
		transaction: (transactionId: string) =>
			["explorer", "transaction", transactionId] as const,
	},
	constitution: {
		detail: () => ["constitution"] as const,
	},
	registry: {
		availability: (name: string) =>
			["registry", "availability", name] as const,
	},
};
