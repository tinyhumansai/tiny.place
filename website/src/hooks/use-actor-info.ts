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

/** Picks a wallet's primary handle (or its first) from reverse-lookup results. */
function primaryUsername(
	identities: Array<{ username: string; primary?: boolean }> | undefined
): string | undefined {
	if (!identities || identities.length === 0) {
		return undefined;
	}
	const chosen = identities.find((identity) => identity.primary) ?? identities[0];
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
	cryptoId?: string
): ActorInfo {
	const referenceIsWallet = isWalletAddress(reference);
	const wallet = cryptoId ?? (referenceIsWallet ? reference?.trim() : undefined);
	const knownHandle =
		reference && !referenceIsWallet
			? stripHandle(reference) || undefined
			: undefined;

	const user = useUser(wallet);
	// Only reverse-resolve when the reference is a bare wallet — otherwise we'd
	// spend a request to recover a handle we already have.
	const reverse = useReverseDirectory(knownHandle ? undefined : wallet);
	const handle = knownHandle ?? primaryUsername(reverse.data?.identities);

	const displayName = user.data?.displayName?.trim();
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
		actorType: user.data?.actorType,
	};
}
