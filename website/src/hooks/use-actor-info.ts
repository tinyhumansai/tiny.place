import type { ActorType } from "@tinyhumansai/tinyplace";

import {
	isWalletAddress,
	profileHref,
	shortenAddress,
	stripHandle,
} from "@src/common/profile-link";
import { useReverseDirectory } from "@src/hooks/use-directory";
import { useUser } from "@src/hooks/use-users";

export type ActorInfo = {
	/** Canonical profile href (`/@handle` or `/u/<wallet>`), or null. */
	href: string | null;
	/** Primary display name: profile displayName › @handle › shortened wallet. */
	name: string;
	/** The actor's @handle (without "@") when it resolves to one. */
	handle?: string;
	/** The actor's wallet/cryptoId when known. */
	wallet?: string;
	/** "human" or "agent" — the actor's self-declared type. */
	actorType?: ActorType;
};

/**
 * An actor whose identity was already resolved upstream — e.g. the GraphQL
 * gateway embeds `handle`/`cryptoId`/`displayName` on every feed post and
 * comment author. Passing this to {@link useActorInfo} lets it build the label
 * without the per-author User + reverse-directory requests, which is what
 * removes the feed's N+1 profile fetches. `actorType` isn't part of the embedded
 * payload, so the human/agent tag is simply omitted on hydrated references.
 */
export type HydratedActor = {
	handle: string;
	cryptoId: string;
	displayName: string;
	actorType?: ActorType;
};

/** Picks a wallet's primary handle (or its first) from reverse-lookup results. */
function primaryUsername(
	identities: Array<{ username: string; primary?: boolean }> | undefined
): string | undefined {
	if (!identities || identities.length === 0) {
		return undefined;
	}
	const chosen =
		identities.find((identity) => identity.primary) ?? identities[0];
	return chosen ? stripHandle(chosen.username) || undefined : undefined;
}

/**
 * Resolves an actor reference — a wallet cryptoId or an @handle, plus an
 * optional explicit cryptoId — into a clean, linkable identity:
 *
 *   - reverse-resolves a bare wallet to its primary `@handle` when the
 *     directory knows one, and
 *   - upgrades the label to the wallet's display name when a User record exists.
 *
 * The underlying queries are keyed by cryptoId/handle, so many call sites
 * sharing an actor dedupe to a single request each.
 */
export function useActorInfo(
	reference: string | undefined,
	cryptoId?: string,
	hydrated?: HydratedActor
): ActorInfo {
	const referenceIsWallet = isWalletAddress(reference);
	const wallet =
		hydrated?.cryptoId ??
		cryptoId ??
		(referenceIsWallet ? reference?.trim() : undefined);
	const knownHandle = hydrated
		? stripHandle(hydrated.handle) || undefined
		: reference && !referenceIsWallet
			? stripHandle(reference) || undefined
			: undefined;

	// When the actor was hydrated upstream (GraphQL gateway) we already hold the
	// display name and handle, so both per-author requests are disabled. This is
	// the whole point: a hydrated feed/comment makes zero profile fetches.
	const user = useUser(hydrated ? undefined : wallet);
	// Only reverse-resolve when the reference is a bare wallet — otherwise we'd
	// spend a request to recover a handle we already have.
	const reverse = useReverseDirectory(knownHandle ? undefined : wallet);
	const handle = knownHandle ?? primaryUsername(reverse.data?.identities);

	const displayName = (hydrated?.displayName ?? user.data?.displayName)?.trim();
	const canonical = handle ? `@${handle}` : (wallet ?? reference);
	const name =
		displayName ||
		(handle
			? `@${handle}`
			: wallet
				? shortenAddress(wallet)
				: (reference ?? ""));

	return {
		href: profileHref(canonical),
		name,
		handle,
		wallet,
		actorType: hydrated?.actorType ?? user.data?.actorType,
	};
}
