import {
	TinyPlaceError,
	type AgentCard,
	type TinyPlaceClient,
} from "@tinyhumansai/tinyplace";

/** Agent-card metadata key under which the Signal encryption pubkey is advertised. */
export const ENCRYPTION_PUBLIC_KEY_METADATA = "encryptionPublicKey";

/** Page size for the directory scan in {@link lookupAgentByEncryptionKey}. */
const REVERSE_LOOKUP_PAGE_SIZE = 100;
/** Hard cap on agents scanned when reverse-resolving an encryption key. */
const REVERSE_LOOKUP_MAX_AGENTS = 300;

/** A directory identity resolved from an encryption key. */
export interface ResolvedAgentIdentity {
	agentId: string;
	username?: string;
}

/**
 * Best-effort reverse lookup: given a Signal encryption pubkey (base64), find the
 * agent that advertises it in the directory. The backend has no index from
 * `metadata.encryptionPublicKey` back to an agent, so this scans the directory a
 * bounded number of pages and matches client-side. Intended for the uncommon
 * first-contact case (a stranger DMs you before you've added them); peers you add
 * yourself are resolved directly via {@link resolveEncryptionAddress}.
 *
 * @returns The matching agent's id and username, or `undefined` if not found
 * within the scan cap (or on any directory error — callers treat this as
 * best-effort and fall back to the truncated key).
 */
export async function lookupAgentByEncryptionKey(
	walletClient: TinyPlaceClient,
	encryptionKey: string
): Promise<ResolvedAgentIdentity | undefined> {
	try {
		for (
			let offset = 0;
			offset < REVERSE_LOOKUP_MAX_AGENTS;
			offset += REVERSE_LOOKUP_PAGE_SIZE
		) {
			// Pagination is inherently sequential: each page depends on whether the
			// previous one already found a match (or ran short), so we can't fan out.
			// eslint-disable-next-line no-await-in-loop
			const { agents } = await walletClient.directory.listAgents({
				limit: REVERSE_LOOKUP_PAGE_SIZE,
				offset,
			});
			for (const card of agents) {
				const advertised = card.metadata?.[ENCRYPTION_PUBLIC_KEY_METADATA];
				if (advertised === encryptionKey || card.publicKey === encryptionKey) {
					return { agentId: card.agentId, username: card.username };
				}
			}
			if (agents.length < REVERSE_LOOKUP_PAGE_SIZE) {
				break;
			}
		}
	} catch {
		// Best-effort; the UI keeps the truncated key when resolution fails.
	}
	return undefined;
}

/**
 * Resolves the messaging/encryption address (base64 Ed25519 pubkey) for an agent
 * card. Prefers the explicitly advertised encryption key; falls back to the card's
 * own `publicKey`, which covers single-key agents whose messaging address is their
 * identity key.
 *
 * @param card - The agent card to resolve.
 * @returns The base64 encryption public key to address messages and bundles to.
 */
export function resolveEncryptionAddress(card: AgentCard): string {
	const advertised = card.metadata?.[ENCRYPTION_PUBLIC_KEY_METADATA];
	const address =
		typeof advertised === "string" && advertised.length > 0
			? advertised
			: card.publicKey;
	if (!address) {
		throw new Error(
			`Agent ${card.agentId} has no encryption public key or wallet public key`
		);
	}
	return address;
}

/**
 * Advertises the wallet's Signal encryption pubkey in its directory agent card so
 * other agents can discover where to fetch its key bundle and address messages.
 * No-op if the card already advertises this key.
 *
 * @param walletClient - A client authenticated with the wallet (directory-write).
 * @param walletAgentId - The wallet's agent id (the card to update).
 * @param encryptionPublicKey - The derived encryption public key (base64).
 * @throws If the card cannot be read or written (other than a 404, which is
 * handled by creating a new card). Callers that treat advertising as best-effort
 * should wrap this in try/catch.
 */
export async function publishEncryptionKey(
	walletClient: TinyPlaceClient,
	walletAgentId: string,
	encryptionPublicKey: string
): Promise<void> {
	// A wallet that owns @handles but has never created a directory agent card
	// 404s here. That's the common case for a human web user, so treat it as
	// "no card yet" and create a minimal one rather than failing — otherwise the
	// encryption key is never advertised and peers can't discover where to send
	// this wallet encrypted messages.
	let card: AgentCard | undefined;
	try {
		card = await walletClient.directory.getAgent(walletAgentId);
	} catch (error) {
		if (!(error instanceof TinyPlaceError) || error.status !== 404) {
			throw error;
		}
	}

	if (
		card?.metadata?.[ENCRYPTION_PUBLIC_KEY_METADATA] === encryptionPublicKey
	) {
		return;
	}

	const now = new Date().toISOString();
	const next: AgentCard = {
		agentId: walletAgentId,
		name: walletAgentId,
		cryptoId: walletAgentId,
		createdAt: now,
		...card,
		metadata: {
			...card?.metadata,
			[ENCRYPTION_PUBLIC_KEY_METADATA]: encryptionPublicKey,
		},
		updatedAt: now,
	};
	await walletClient.directory.upsertAgent(walletAgentId, next);
}
