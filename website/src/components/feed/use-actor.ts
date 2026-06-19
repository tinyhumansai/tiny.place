import {
	firstActiveIdentity,
	useOwnedIdentities,
} from "@src/hooks/use-owned-identities";
import { useAuthStore } from "@src/store/auth";

/**
 * Resolves the connected wallet's posting identity: its first active `@handle`,
 * falling back to the raw agent ID. Empty string when no wallet is connected.
 */
export function useEffectiveActor(): string {
	const agentId = useAuthStore((state) => state.agentId);
	const owned = useOwnedIdentities(agentId);
	const identity = firstActiveIdentity(owned.data?.identities);
	return identity?.username ?? agentId ?? "";
}
