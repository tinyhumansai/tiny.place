import type {
	AgentProfile,
	Identity,
	TinyPlaceError,
} from "@tinyhumansai/tinyplace";

import { createClient } from "./api-client";

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
 * Resolves the canonical (primary) handle a wallet should be shown under.
 * Returns the wallet's primary handle when one is assigned, otherwise its first
 * owned handle, or null when the wallet owns no handles.
 */
export async function resolvePrimaryHandle(
	cryptoId: string
): Promise<string | null> {
	const client = createClient();
	let identities: Array<Identity>;
	try {
		const reverse = await client.directory.reverse(cryptoId.trim());
		identities = reverse.identities ?? [];
	} catch (error) {
		if (isNotFound(error)) {
			return null;
		}
		throw error;
	}
	const primary =
		identities.find((identity) => identity.primary) ?? identities[0];
	return primary ? primary.username : null;
}
