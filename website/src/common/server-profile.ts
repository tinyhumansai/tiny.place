import type {
	AgentProfile,
	Identity,
	TinyPlaceError,
	User,
} from "@tinyhumansai/tinyplace";

import {
	emptyUser,
	userToProfile,
} from "@src/components/profile/profile-adapter";

import { createClient } from "./api-client";
import { isWalletAddress } from "./profile-link";

/**
 * The public base URL of the web app, used to build canonical/OpenGraph URLs in
 * profile metadata. Defaults to production.
 */
export const SITE_URL: string =
	process.env["NEXT_PUBLIC_SITE_URL"] ?? "https://tiny.place";

/** Ensures a handle has a leading "@". */
export function ensureHandle(name: string): string {
	const trimmed = name.trim();
	return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
}

function isNotFound(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"status" in error &&
		(error as TinyPlaceError).status === 404
	);
}

/**
 * Fetches a public agent profile by handle, server-side and unauthenticated
 * (so it works for crawlers and signed-out visitors). Returns null when the
 * handle does not resolve to a profile; rethrows unexpected errors.
 */
export async function fetchProfileByHandle(
	handle: string
): Promise<AgentProfile | null> {
	const client = createClient();
	try {
		return await client.profiles.get(ensureHandle(handle));
	} catch (error) {
		if (isNotFound(error)) {
			return null;
		}
		throw error;
	}
}

/**
 * Fetches a wallet User profile by cryptoId. Returns null when the wallet does
 * not have a profile record yet; rethrows unexpected API errors.
 */
export async function fetchUserByCryptoId(
	cryptoId: string
): Promise<User | null> {
	const client = createClient();
	try {
		return await client.users.get(cryptoId.trim());
	} catch (error) {
		if (isNotFound(error)) {
			return null;
		}
		throw error;
	}
}

/**
 * Fetches every handle owned by a wallet. Returns an empty list when the wallet
 * has no reverse-directory record yet.
 */
export async function fetchIdentitiesByCryptoId(
	cryptoId: string
): Promise<Array<Identity>> {
	const client = createClient();
	try {
		const reverse = await client.directory.reverse(cryptoId.trim());
		return reverse.identities ?? [];
	} catch (error) {
		if (isNotFound(error)) {
			return [];
		}
		throw error;
	}
}

/**
 * Resolves the canonical (primary) handle a wallet should be shown under.
 * Returns the wallet's primary handle when one is assigned, otherwise its first
 * owned handle, or null when the wallet owns no handles.
 */
export async function resolvePrimaryHandle(
	cryptoId: string
): Promise<string | null> {
	const identities = await fetchIdentitiesByCryptoId(cryptoId);
	const primary =
		identities.find((identity) => identity.primary) ?? identities[0];
	return primary ? primary.username : null;
}

/** Picks the profile display handle from a wallet's owned identities. */
export function primaryHandleFromIdentities(
	identities: Array<Identity>
): string | null {
	const primary =
		identities.find((identity) => identity.primary) ?? identities[0];
	return primary ? primary.username : null;
}

/**
 * Resolves a profile from a single `/u/<id>` segment that may be either a base58
 * wallet/cryptoId or an @handle (bare). Returns null when nothing resolves.
 */
export async function resolveProfileById(
	id: string
): Promise<AgentProfile | null> {
	const decoded = id.trim();
	if (decoded === "") {
		return null;
	}
	if (isWalletAddress(decoded)) {
		const [user, identities] = await Promise.all([
			fetchUserByCryptoId(decoded),
			fetchIdentitiesByCryptoId(decoded),
		]);
		return userToProfile(
			user ?? emptyUser(decoded),
			primaryHandleFromIdentities(identities) ?? undefined,
			identities
		);
	}
	return fetchProfileByHandle(decoded);
}
