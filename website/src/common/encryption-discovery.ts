import type { AgentCard, TinyPlaceClient } from "@tinyhumansai/tinyplace";

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
 * @throws If the card cannot be read or written. Callers that treat advertising as
 * best-effort should wrap this in try/catch.
 */
export async function publishEncryptionKey(
	walletClient: TinyPlaceClient,
	walletAgentId: string,
	encryptionPublicKey: string
): Promise<void> {
	const card = await walletClient.directory.getAgent(walletAgentId);
	const metadata = { ...card.metadata };
	if (metadata[ENCRYPTION_PUBLIC_KEY_METADATA] === encryptionPublicKey) {
		return;
	}
	metadata[ENCRYPTION_PUBLIC_KEY_METADATA] = encryptionPublicKey;
	await walletClient.directory.upsertAgent(walletAgentId, {
		...card,
		metadata,
		updatedAt: new Date().toISOString(),
	});
}
