"use client";

import type {
	BridgeRoute,
	GasEstimate,
	PriceQuote,
	SwapQuote,
} from "@tinyhumansai/tinyplace";

import type { FunctionComponent } from "@src/common/types";
import {
	useBridgeQuote,
	useBridgeRoutes,
	useGasEstimate,
	usePriceQuote,
	usePricingAssets,
	usePricingNetworks,
	usePricingPairs,
	useSwapQuote,
} from "@src/hooks/use-pricing";

const SOLANA_NETWORK = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const BASE_NETWORK = "eip155:8453";

function formatAmount(value: string | undefined): string {
	if (!value) {
		return "-";
	}
	const number = Number.parseFloat(value);
	if (Number.isNaN(number)) {
		return value;
	}
	return number.toLocaleString(undefined, {
		maximumFractionDigits: 6,
	});
}

function Panel({
	children,
	isDark,
	title,
}: {
	children: React.ReactNode;
	isDark: boolean;
	title: string;
}): React.ReactElement {
	return (
		<div
			className={`rounded-lg border p-4 ${
				isDark
					? "border-neutral-800 bg-neutral-950"
					: "border-neutral-200 bg-neutral-50"
			}`}
		>
			<h3
				className={`mb-3 text-sm font-medium ${isDark ? "text-white" : "text-black"}`}
			>
				{title}
			</h3>
			{children}
		</div>
	);
}

function DataState({
	children,
	isDark,
	isError,
	isLoading,
}: {
	children: React.ReactNode;
	isDark: boolean;
	isError: boolean;
	isLoading: boolean;
}): React.ReactElement {
	if (isLoading) {
		return (
			<p
				className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-500"}`}
			>
				Loading...
			</p>
		);
	}
	if (isError) {
		return <p className="text-xs text-red-500">Unavailable from staging.</p>;
	}
	return <>{children}</>;
}

function QuoteSummary({
	isDark,
	quote,
}: {
	isDark: boolean;
	quote: PriceQuote | undefined;
}): React.ReactElement {
	if (!quote) {
		return <p className="text-xs text-neutral-500">No quote returned.</p>;
	}
	return (
		<div className="grid grid-cols-3 gap-2 text-xs">
			<div>
				<p className={isDark ? "text-neutral-500" : "text-neutral-500"}>Pair</p>
				<p className={isDark ? "text-white" : "text-black"}>
					{quote.base}/{quote.quote}
				</p>
			</div>
			<div>
				<p className={isDark ? "text-neutral-500" : "text-neutral-500"}>Mid</p>
				<p className={isDark ? "text-white" : "text-black"}>
					{formatAmount(quote.mid)}
				</p>
			</div>
			<div>
				<p className={isDark ? "text-neutral-500" : "text-neutral-500"}>
					24h Change
				</p>
				<p className={isDark ? "text-white" : "text-black"}>
					{formatAmount(quote.change24h)}%
				</p>
			</div>
		</div>
	);
}

function GasSummary({
	gas,
	isDark,
}: {
	gas: GasEstimate | undefined;
	isDark: boolean;
}): React.ReactElement {
	if (!gas) {
		return (
			<p className="text-xs text-neutral-500">No gas estimate returned.</p>
		);
	}
	return (
		<div className="grid grid-cols-3 gap-2 text-xs">
			{[
				["Slow", gas.slow],
				["Standard", gas.standard],
				["Fast", gas.fast],
			].map(([label, value]) => (
				<div key={label}>
					<p className={isDark ? "text-neutral-500" : "text-neutral-500"}>
						{label}
					</p>
					<p className={isDark ? "text-white" : "text-black"}>
						{formatAmount(value)} {gas.unit}
					</p>
				</div>
			))}
		</div>
	);
}

function SwapSummary({
	isDark,
	swap,
}: {
	isDark: boolean;
	swap: SwapQuote | undefined;
}): React.ReactElement {
	if (!swap) {
		return <p className="text-xs text-neutral-500">No swap quote returned.</p>;
	}
	return (
		<div className="space-y-2 text-xs">
			<div className="flex items-center justify-between gap-2">
				<span className={isDark ? "text-neutral-500" : "text-neutral-500"}>
					{swap.from.asset} to {swap.to.asset}
				</span>
				<span className={isDark ? "text-white" : "text-black"}>
					{formatAmount(swap.to.amount)} {swap.to.asset}
				</span>
			</div>
			<div className="flex items-center justify-between gap-2">
				<span className={isDark ? "text-neutral-500" : "text-neutral-500"}>
					Rate
				</span>
				<span className={isDark ? "text-white" : "text-black"}>
					{formatAmount(swap.rate)}
				</span>
			</div>
			<p className={isDark ? "text-neutral-500" : "text-neutral-500"}>
				{swap.route.join(" -> ")}
			</p>
		</div>
	);
}

function BridgeRouteList({
	isDark,
	routes,
}: {
	isDark: boolean;
	routes: Array<BridgeRoute>;
}): React.ReactElement {
	if (routes.length === 0) {
		return <p className="text-xs text-neutral-500">No routes returned.</p>;
	}
	return (
		<div className="space-y-2">
			{routes.slice(0, 3).map((route) => (
				<div
					key={`${route.provider}-${route.from.network}-${route.to.network}`}
					className={`rounded-md border p-2 text-xs ${
						isDark
							? "border-neutral-800 bg-neutral-900"
							: "border-neutral-200 bg-white"
					}`}
				>
					<div className="flex items-center justify-between gap-2">
						<span className={isDark ? "text-white" : "text-black"}>
							{route.provider}
						</span>
						<span className={isDark ? "text-neutral-500" : "text-neutral-500"}>
							{route.estimatedTime}
						</span>
					</div>
					<p className={isDark ? "text-neutral-500" : "text-neutral-500"}>
						Fee {formatAmount(route.fee.amount)} {route.fee.asset}
					</p>
				</div>
			))}
		</div>
	);
}

export const PricingMock = ({
	isDark,
}: {
	isDark: boolean;
}): FunctionComponent => {
	const priceQuote = usePriceQuote({
		base: "SOL",
		quote: "USDC",
		network: SOLANA_NETWORK,
	});
	const assets = usePricingAssets();
	const pairs = usePricingPairs();
	const networks = usePricingNetworks();
	const gas = useGasEstimate(BASE_NETWORK);
	const swapQuote = useSwapQuote({
		from: "SOL",
		to: "USDC",
		amount: "1",
		network: SOLANA_NETWORK,
	});
	const bridgeRoutes = useBridgeRoutes({
		from: BASE_NETWORK,
		to: SOLANA_NETWORK,
		asset: "USDC",
	});
	const bridgeQuote = useBridgeQuote({
		from: BASE_NETWORK,
		to: SOLANA_NETWORK,
		asset: "USDC",
		amount: "1000000",
	});

	return (
		<div className="grid gap-4 md:grid-cols-2">
			<Panel isDark={isDark} title="Price Quote">
				<DataState
					isDark={isDark}
					isError={priceQuote.isError}
					isLoading={priceQuote.isLoading}
				>
					<QuoteSummary isDark={isDark} quote={priceQuote.data} />
				</DataState>
			</Panel>

			<Panel isDark={isDark} title="Gas Estimate">
				<DataState
					isDark={isDark}
					isError={gas.isError}
					isLoading={gas.isLoading}
				>
					<GasSummary gas={gas.data} isDark={isDark} />
				</DataState>
			</Panel>

			<Panel isDark={isDark} title="Supported Markets">
				<div className="grid grid-cols-3 gap-2 text-xs">
					<div>
						<p className={isDark ? "text-neutral-500" : "text-neutral-500"}>
							Assets
						</p>
						<p className={isDark ? "text-white" : "text-black"}>
							{assets.data?.assets.length ?? 0}
						</p>
					</div>
					<div>
						<p className={isDark ? "text-neutral-500" : "text-neutral-500"}>
							Pairs
						</p>
						<p className={isDark ? "text-white" : "text-black"}>
							{pairs.data?.pairs.length ?? 0}
						</p>
					</div>
					<div>
						<p className={isDark ? "text-neutral-500" : "text-neutral-500"}>
							Networks
						</p>
						<p className={isDark ? "text-white" : "text-black"}>
							{networks.data?.networks.length ?? 0}
						</p>
					</div>
				</div>
				{(assets.isError || pairs.isError || networks.isError) && (
					<p className="mt-2 text-xs text-red-500">
						Some market metadata is unavailable.
					</p>
				)}
			</Panel>

			<Panel isDark={isDark} title="Swap Quote">
				<DataState
					isDark={isDark}
					isError={swapQuote.isError}
					isLoading={swapQuote.isLoading}
				>
					<SwapSummary isDark={isDark} swap={swapQuote.data} />
				</DataState>
			</Panel>

			<Panel isDark={isDark} title="Bridge Routes">
				<DataState
					isDark={isDark}
					isError={bridgeRoutes.isError}
					isLoading={bridgeRoutes.isLoading}
				>
					<BridgeRouteList
						isDark={isDark}
						routes={bridgeRoutes.data?.routes ?? []}
					/>
				</DataState>
			</Panel>

			<Panel isDark={isDark} title="Bridge Quote">
				<DataState
					isDark={isDark}
					isError={bridgeQuote.isError}
					isLoading={bridgeQuote.isLoading}
				>
					<div className="space-y-2 text-xs">
						<div className="flex items-center justify-between gap-2">
							<span
								className={isDark ? "text-neutral-500" : "text-neutral-500"}
							>
								Provider
							</span>
							<span className={isDark ? "text-white" : "text-black"}>
								{bridgeQuote.data?.provider ?? "-"}
							</span>
						</div>
						<div className="flex items-center justify-between gap-2">
							<span
								className={isDark ? "text-neutral-500" : "text-neutral-500"}
							>
								Fee
							</span>
							<span className={isDark ? "text-white" : "text-black"}>
								{formatAmount(bridgeQuote.data?.fee.amount)}{" "}
								{bridgeQuote.data?.fee.asset ?? ""}
							</span>
						</div>
					</div>
				</DataState>
			</Panel>
		</div>
	);
};
