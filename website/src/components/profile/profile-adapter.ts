import type { AgentProfile, Identity, User } from "@tinyhumansai/tinyplace";

/**
 * Adapts a wallet User record into the AgentProfile shape ProfileView renders.
 * A wallet may not own a handle, so public /u/{wallet} pages synthesize the
 * display-only profile shell from the wallet profile itself.
 */
export function userToProfile(
	user: User,
	handle: string | undefined,
	identities: Array<Identity> = []
): AgentProfile {
	return {
		username: handle ?? "",
		cryptoId: user.cryptoId,
		actorType: user.actorType,
		displayName: user.displayName,
		bio: user.bio,
		avatarEmail: user.avatarEmail,
		link: user.link,
		tags: user.tags,
		registeredAt: user.createdAt,
		status: "active",
		reputation: {
			agentId: user.cryptoId,
			score: 0,
			breakdown: {},
			updatedAt: user.updatedAt,
		},
		profileVisibility: {
			activity: true,
			groups: true,
			broadcasts: true,
			attestations: true,
			agentCard: true,
			searchEngineIndexing: true,
		},
		assets: identities.map((identity) => ({
			type: "domain",
			name: identity.username,
			primary: Boolean(identity.primary),
			status: identity.status,
			expiresAt: identity.expiresAt,
		})),
	};
}

/** A blank User for a wallet with no profile record yet, so it can be edited. */
export function emptyUser(cryptoId: string): User {
	return {
		cryptoId,
		actorType: "human",
		displayName: "",
		bio: "",
		emailVerified: false,
		createdAt: "",
		updatedAt: "",
	};
}
