import { PublicKey } from "@solana/web3.js";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
	SOLANA_TOKEN_PROGRAM_ID,
	type SupportedAsset,
} from "@tinyhumansai/tinyplace";

import { publicUsdcMint } from "@src/common/delegated-payment";
import { queryKeys } from "@src/common/query-keys";
import {
	useTinyplaceConnection,
	useTinyplaceWallet,
} from "@src/common/tinyplace-wallet";
import { useSupportedPayments } from "@src/hooks/use-payments";

type WalletBalance = {
	amount: string;
	decimals: number;
	kind: "native" | "spl";
	mint?: string;
	network: string;
	rawAmount: string;
	symbol: string;
};

type TokenAsset = Pick<SupportedAsset, "address" | "decimals" | "symbol">;

const USDC_DECIMALS = 6;
const PUBLIC_USDC_MINT = publicUsdcMint();

function shortMint(mint: string): string {
	return `${mint.slice(0, 4)}...${mint.slice(-4)}`;
}

export function formatUnits(rawAmount: bigint, decimals: number): string {
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
	kind,
	mint,
	network,
	rawAmount,
	symbol,
}: {
	decimals: number;
	kind: WalletBalance["kind"];
	mint?: string;
	network: string;
	rawAmount: bigint;
	symbol: string;
}): WalletBalance {
	return {
		amount: formatUnits(rawAmount, decimals),
		decimals,
		kind,
		mint,
		network,
		rawAmount: rawAmount.toString(),
		symbol,
	};
}

function tokenAssetKey(asset: TokenAsset): string | undefined {
	return asset.address?.trim();
}

export function tokenAssetsWithUsdcFallback(
	assets: Array<TokenAsset>
): Array<TokenAsset> {
	const byMint = new Map<string, TokenAsset>();

	for (const asset of assets) {
		const mint = tokenAssetKey(asset);
		if (mint) {
			byMint.set(mint, asset);
		}
	}

	if (!byMint.has(PUBLIC_USDC_MINT)) {
		byMint.set(PUBLIC_USDC_MINT, {
			address: PUBLIC_USDC_MINT,
			decimals: USDC_DECIMALS,
			symbol: "USDC",
		});
	}

	return Array.from(byMint.values());
}

function balanceSortValue(balance: WalletBalance): number {
	if (balance.kind === "native") {
		return 0;
	}
	if (balance.symbol.toUpperCase() === "USDC") {
		return 1;
	}
	return 2;
}

function sortBalances(balances: Array<WalletBalance>): Array<WalletBalance> {
	return [...balances].sort((left, right) => {
		const leftValue = balanceSortValue(left);
		const rightValue = balanceSortValue(right);
		if (leftValue !== rightValue) {
			return leftValue - rightValue;
		}
		return left.symbol.localeCompare(right.symbol);
	});
}

export function useWalletBalancesForAddress(
	walletAddress: string | undefined
): UseQueryResult<Array<WalletBalance>> {
	const connection = useTinyplaceConnection();
	const supported = useSupportedPayments();
	const wallet = walletAddress ?? "";

	return useQuery({
		queryKey: queryKeys.payments.walletBalances(wallet),
		queryFn: async (): Promise<Array<WalletBalance>> => {
			if (!wallet) {
				return [];
			}
			const owner = new PublicKey(wallet);

			const solanaChain = supported.data?.chains.find(
				(chain) => chain.kind === "solana"
			);
			const network = solanaChain?.network ?? "solana";
			const nativeSymbol = solanaChain?.nativeAsset ?? "SOL";
			const balances: Array<WalletBalance> = [];
			const lamports = await connection.getBalance(owner, "confirmed");

			balances.push(
				toBalance({
					decimals: 9,
					kind: "native",
					network,
					rawAmount: BigInt(lamports),
					symbol: nativeSymbol,
				})
			);

			const tokenAssets = tokenAssetsWithUsdcFallback(
				solanaChain?.assets.filter((asset) => asset.address) ?? []
			);
			const assetByMint = new Map(
				tokenAssets.map((asset) => [asset.address ?? "", asset])
			);
			const rawByMint = new Map<string, bigint>();
			const accountBalances = await connection.getParsedTokenAccountsByOwner(
				owner,
				{ programId: new PublicKey(SOLANA_TOKEN_PROGRAM_ID) },
				"confirmed"
			);

			for (const account of accountBalances.value) {
				const parsed = account.account.data.parsed as {
					info?: {
						mint?: string;
						tokenAmount?: { amount?: string; decimals?: number };
					};
				};
				const mint = parsed.info?.mint;
				if (!mint) {
					continue;
				}
				const amount = parsed.info?.tokenAmount?.amount ?? "0";
				rawByMint.set(mint, (rawByMint.get(mint) ?? 0n) + BigInt(amount));

				if (!assetByMint.has(mint)) {
					assetByMint.set(mint, {
						address: mint,
						decimals: parsed.info?.tokenAmount?.decimals ?? 0,
						symbol: shortMint(mint),
					});
				}
			}

			const tokenBalances = Array.from(assetByMint.values()).map((asset) =>
				toBalance({
					decimals: asset.decimals,
					kind: "spl",
					mint: asset.address,
					network,
					rawAmount: rawByMint.get(asset.address ?? "") ?? 0n,
					symbol: asset.symbol,
				})
			);

			return sortBalances(balances.concat(tokenBalances));
		},
		enabled: Boolean(wallet) && !supported.isLoading,
	});
}

export function useWalletBalances(): UseQueryResult<Array<WalletBalance>> {
	const { publicKey } = useTinyplaceWallet();
	const wallet = publicKey?.toBase58() ?? "";

	return useWalletBalancesForAddress(wallet);
}

export type { WalletBalance };
