import {
	TinyPlaceError,
	type AgentCard,
	type TinyPlaceClient,
} from "@tinyhumansai/tinyplace";

/** Agent-card metadata key under which the Signal encryption pubkey is advertised. */
export const ENCRYPTION_PUBLIC_KEY_METADATA = "encryptionPublicKey";

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
