"use client";

import type { GasEstimate, PriceQuote } from "@tinyhumansai/tinyplace";

import type { FunctionComponent } from "@src/common/types";
import {
	useGasEstimate,
	usePriceQuote,
	usePricingAssets,
	usePricingNetworks,
	usePricingPairs,
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

export const Pricing = ({ isDark }: { isDark: boolean }): FunctionComponent => {
	const priceQuote = usePriceQuote({
		base: "SOL",
		quote: "USDC",
		network: SOLANA_NETWORK,
	});
	const assets = usePricingAssets();
	const pairs = usePricingPairs();
	const networks = usePricingNetworks();
	const gas = useGasEstimate(BASE_NETWORK);

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
		</div>
	);
};
