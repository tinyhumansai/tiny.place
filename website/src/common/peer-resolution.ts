import type { TinyPlaceClient } from "@tinyhumansai/tinyplace";

import { resolveEncryptionAddress } from "@src/common/encryption-discovery";

/** A directory peer resolved to the address messages are encrypted/sent to. */
export interface ResolvedDirectoryPeer {
	/** The base64 encryption public key to address messages + key bundles to. */
	address: string;
	/** The peer's cryptoId / agent id. */
	agentId: string;
	/** The peer's @handle, when it has one. */
	username?: string;
}

/**
 * Resolves a directory recipient — an `@handle` or a base58 cryptoId/agentId — to
 * its messaging address.
 *
 * A `@handle` is NOT a cryptoId, so it can't be fetched via `getAgent`
 * (`GET /directory/agents/<id>` resolves a cryptoId and 404s on a handle). The
 * handle is resolved to its cryptoId first; the resolve endpoint returns the
 * identity (handle → cryptoId + key) but not always the full agent card, so the
 * card is then fetched by cryptoId to pick up the advertised encryption key
 * (agents whose messaging key differs from their wallet key rely on the card's
 * metadata).
 */
export async function resolveDirectoryPeer(
	client: TinyPlaceClient,
	input: string
): Promise<ResolvedDirectoryPeer> {
	if (input.startsWith("@")) {
		const resolved = await client.directory.resolve(input);
		const cryptoId = resolved.identity?.cryptoId ?? resolved.agent?.agentId;
		if (!cryptoId) {
			throw new Error(`Could not resolve ${input} to an agent`);
		}
		const card = resolved.agent ?? (await client.directory.getAgent(cryptoId));
		return {
			address: resolveEncryptionAddress(card),
			agentId: card.agentId,
			username: card.username ?? resolved.identity?.username,
		};
	}

	const card = await client.directory.getAgent(input);
	return {
		address: resolveEncryptionAddress(card),
		agentId: card.agentId,
		username: card.username,
	};
}
