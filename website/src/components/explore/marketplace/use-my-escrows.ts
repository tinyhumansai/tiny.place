import type { Escrow } from "@tinyhumansai/tinyplace";

import { useEscrows } from "@src/hooks/use-escrow";

export type MyEscrowsResult = {
	escrows: Array<Escrow>;
	isError: boolean;
	isLoading: boolean;
	refetch: () => void;
};

/**
 * Escrows the connected agent is party to, in either role. The backend's escrow
 * list filters by a single `client` or `provider` value, so we issue both
 * queries with the agent's identifier and merge them, de-duplicating by id.
 */
export function useMyEscrows(actor: string | undefined): MyEscrowsResult {
	const asClient = useEscrows(
		actor ? { client: actor, limit: 100 } : undefined
	);
	const asProvider = useEscrows(
		actor ? { provider: actor, limit: 100 } : undefined
	);

	const byId = new Map<string, Escrow>();
	for (const escrow of asClient.data?.escrows ?? []) {
		byId.set(escrow.escrowId, escrow);
	}
	for (const escrow of asProvider.data?.escrows ?? []) {
		byId.set(escrow.escrowId, escrow);
	}

	const escrows = Array.from(byId.values()).sort((left, right) =>
		(right.fundedAt ?? right.createdAt).localeCompare(
			left.fundedAt ?? left.createdAt
		)
	);

	return {
		escrows,
		isError: asClient.isError || asProvider.isError,
		isLoading: asClient.isLoading || asProvider.isLoading,
		refetch: (): void => {
			void asClient.refetch();
			void asProvider.refetch();
		},
	};
}

export type EscrowRole = "client" | "provider";

export function escrowRole(
	escrow: Escrow,
	actor: string | undefined,
	cryptoId: string | undefined
): EscrowRole | undefined {
	if (escrow.client === actor || escrow.clientCryptoId === cryptoId) {
		return "client";
	}
	if (escrow.provider === actor || escrow.providerCryptoId === cryptoId) {
		return "provider";
	}
	return undefined;
}
