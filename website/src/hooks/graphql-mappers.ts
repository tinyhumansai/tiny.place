import type {
	AgentCard,
	Comment,
	GqlAgentCard,
	GqlComment,
	GqlLedgerTransaction,
	GqlPost,
	GqlProfile,
	LedgerTransaction,
	Post,
	AgentProfile,
} from "@tinyhumansai/tinyplace";

export function postFromGql(post: GqlPost): Post {
	return {
		...post,
		author: post.author.handle,
		authorCryptoId: post.author.cryptoId,
		likedByMe: post.viewerHasLiked,
	};
}

export function commentFromGql(comment: GqlComment): Comment {
	return {
		...comment,
		author: comment.author.handle,
		authorCryptoId: comment.author.cryptoId,
	};
}

/**
 * Map a GraphQL agent card onto the REST {@link AgentCard} shape used across the
 * directory UI, preserving the server-resolved `viewerIsFollowing` edge. The
 * required `createdAt`/`updatedAt` are coerced from the optional GraphQL fields.
 */
export function agentFromGql(agent: GqlAgentCard): AgentCard {
	return {
		...agent,
		createdAt: agent.createdAt ?? "",
		updatedAt: agent.updatedAt ?? "",
	};
}

export function ledgerTransactionFromGql(
	transaction: GqlLedgerTransaction
): LedgerTransaction {
	return {
		...transaction,
		metadata: transaction.metadata
			? Object.fromEntries(
					Object.entries(transaction.metadata).map(([key, value]) => [
						key,
						String(value),
					])
				)
			: undefined,
	};
}

export function profileFromGql(
	profile: GqlProfile,
	username: string
): AgentProfile {
	const assets = (profile.identities ?? []).map((identity) => ({
		type: "domain",
		name: identity.username,
		primary: Boolean(identity.primary),
		status: identity.status,
		expiresAt: identity.expiresAt,
	}));
	return {
		username:
			assets.find((asset) => asset.primary)?.name ||
			assets[0]?.name ||
			username,
		cryptoId: profile.cryptoId,
		actorType: profile.actorType as AgentProfile["actorType"],
		displayName: profile.displayName,
		bio: profile.bio,
		link: profile.link,
		tags: profile.tags,
		registeredAt: profile.createdAt,
		status: profile.private ? "private" : "active",
		reputation: {
			agentId: profile.cryptoId,
			username,
			score: 0,
			breakdown: {},
			updatedAt: profile.updatedAt,
		},
		profileVisibility: {
			activity: true,
			groups: true,
			broadcasts: true,
			attestations: true,
			agentCard: Boolean(profile.agentCard),
			searchEngineIndexing: !profile.private,
		},
		assets,
		attestations: profile.attestations.map((attestation) => ({
			platform: attestation.platform,
			handle: attestation.handle,
			status: attestation.status,
		})),
		agentCard: profile.agentCard
			? {
					name: profile.agentCard.name,
					description: profile.agentCard.description,
					url: profile.agentCard.url,
					skills: profile.agentCard.skills,
				}
			: undefined,
	};
}
