import { TinyPlaceError, type Signer } from "@tinyhumansai/tinyplace";

import { createClient } from "@src/common/api-client";

/**
 * Provisions the backend User profile the moment a wallet signs in, so the
 * profile is the source of truth that exists "on signup" — discoverable in the
 * directory and resolvable for signed writes (reputation attestations, etc.)
 * without first walking the onboarding wizard.
 *
 * Idempotent and best-effort: it reads the profile first and only creates one
 * when missing (a 404), so it never clobbers an existing profile's fields and
 * never blocks sign-in if the backend is unreachable. The web app registers
 * humans, so a freshly created profile is marked actorType "human".
 */
export async function ensureBackendProfile(signer: Signer): Promise<void> {
	const agentId = signer.agentId;
	if (!agentId) {
		return;
	}
	const client = createClient(signer);
	try {
		await client.users.get(agentId);
		return; // Profile already exists — leave it untouched.
	} catch (error) {
		if (!(error instanceof TinyPlaceError && error.status === 404)) {
			return; // Network/other error — don't block sign-in.
		}
	}
	try {
		await client.users.updateProfile(agentId, { actorType: "human" });
	} catch {
		// Best-effort: a transient failure here just defers creation to the
		// onboarding wizard's first profile write.
	}
}
