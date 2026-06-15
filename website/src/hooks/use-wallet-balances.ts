import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { queryKeys } from "@src/common/query-keys";
import { useSupportedPayments } from "@src/hooks/use-payments";

type WalletBalance = {
	amount: string;
	decimals: number;
	network: string;
	rawAmount: string;
	symbol: string;
};

function formatUnits(rawAmount: bigint, decimals: number): string {
	const negative = rawAmount < 0n;
	const absolute = negative ? -rawAmount : rawAmount;
	const base = 10n ** BigInt(decimals);
	const whole = absolute / base;
	const fraction = absolute % base;

	if (decimals === 0 || fraction === 0n) {
		return `${negative ? "-" : ""}${whole.toString()}`;
	}

	const padded = fraction.toString().padStart(decimals, "0");
	const trimmed = padded.replace(/0+$/, "");
	return `${negative ? "-" : ""}${whole.toString()}.${trimmed}`;
}

function toBalance({
	decimals,
	network,
	rawAmount,
	symbol,
}: {
	decimals: number;
	network: string;
	rawAmount: bigint;
	symbol: string;
}): WalletBalance {
	return {
		amount: formatUnits(rawAmount, decimals),
		decimals,
		network,
		rawAmount: rawAmount.toString(),
		symbol,
	};
}

export function useWalletBalances(): UseQueryResult<Array<WalletBalance>> {
	const { connection } = useConnection();
	const { publicKey } = useWallet();
	const supported = useSupportedPayments();
	const wallet = publicKey?.toBase58() ?? "";

	return useQuery({
		queryKey: queryKeys.payments.walletBalances(wallet),
		queryFn: async (): Promise<Array<WalletBalance>> => {
			if (!publicKey) {
				return [];
			}

			const solanaChain = supported.data?.chains.find(
				(chain) => chain.kind === "solana"
			);
			const network = solanaChain?.network ?? "solana";
			const nativeSymbol = solanaChain?.nativeAsset ?? "SOL";
			const balances: Array<WalletBalance> = [];
			const lamports = await connection.getBalance(publicKey, "confirmed");

			balances.push(
				toBalance({
					decimals: 9,
					network,
					rawAmount: BigInt(lamports),
					symbol: nativeSymbol,
				})
			);

			const tokenAssets =
				solanaChain?.assets.filter((asset) => asset.address) ?? [];
			const tokenBalances = await Promise.all(
				tokenAssets.map(async (asset): Promise<WalletBalance | null> => {
					const mint = new PublicKey(asset.address ?? "");
					const accounts = await connection.getParsedTokenAccountsByOwner(
						publicKey,
						{ mint },
						"confirmed"
					);
					const rawAmount = accounts.value.reduce<bigint>((total, account) => {
						const parsed = account.account.data.parsed as {
							info?: { tokenAmount?: { amount?: string } };
						};
						const amount = parsed.info?.tokenAmount?.amount ?? "0";
						return total + BigInt(amount);
					}, 0n);

					return toBalance({
						decimals: asset.decimals,
						network,
						rawAmount,
						symbol: asset.symbol,
					});
				})
			);

			return balances.concat(
				tokenBalances.filter(
					(balance): balance is WalletBalance => balance !== null
				)
			);
		},
		enabled: Boolean(publicKey) && !supported.isLoading,
	});
}

export type { WalletBalance };
