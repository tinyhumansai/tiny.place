"use client";

import type { GasEstimate, PriceQuote } from "@tinyhumansai/tinyplace";
import { useTranslation } from "react-i18next";

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
	const { t } = useTranslation();
	if (isLoading) {
		return (
			<p
				className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-500"}`}
			>
				{t("common.loading")}
			</p>
		);
	}
	if (isError) {
		return <p className="text-xs text-red-500">{t("pricing.unavailable")}</p>;
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
	const { t } = useTranslation();
	if (!quote) {
		return <p className="text-xs text-neutral-500">{t("pricing.noQuote")}</p>;
	}
	return (
		<div className="grid grid-cols-3 gap-2 text-xs">
			<div>
				<p className={isDark ? "text-neutral-500" : "text-neutral-500"}>
					{t("pricing.pair")}
				</p>
				<p className={isDark ? "text-white" : "text-black"}>
					{quote.base}/{quote.quote}
				</p>
			</div>
			<div>
				<p className={isDark ? "text-neutral-500" : "text-neutral-500"}>
					{t("pricing.mid")}
				</p>
				<p className={isDark ? "text-white" : "text-black"}>
					{formatAmount(quote.mid)}
				</p>
			</div>
			<div>
				<p className={isDark ? "text-neutral-500" : "text-neutral-500"}>
					{t("pricing.change24h")}
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
	const { t } = useTranslation();
	if (!gas) {
		return (
			<p className="text-xs text-neutral-500">{t("pricing.noGasEstimate")}</p>
		);
	}
	const speeds: Array<[string, string | undefined]> = [
		[t("pricing.gas.slow"), gas.slow],
		[t("pricing.gas.standard"), gas.standard],
		[t("pricing.gas.fast"), gas.fast],
	];
	return (
		<div className="grid grid-cols-3 gap-2 text-xs">
			{speeds.map(([label, value]) => (
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
	const { t } = useTranslation();
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
			<Panel isDark={isDark} title={t("pricing.priceQuote")}>
				<DataState
					isDark={isDark}
					isError={priceQuote.isError}
					isLoading={priceQuote.isLoading}
				>
					<QuoteSummary isDark={isDark} quote={priceQuote.data} />
				</DataState>
			</Panel>

			<Panel isDark={isDark} title={t("pricing.gasEstimate")}>
				<DataState
					isDark={isDark}
					isError={gas.isError}
					isLoading={gas.isLoading}
				>
					<GasSummary gas={gas.data} isDark={isDark} />
				</DataState>
			</Panel>

			<Panel isDark={isDark} title={t("pricing.supportedMarkets")}>
				<div className="grid grid-cols-3 gap-2 text-xs">
					<div>
						<p className={isDark ? "text-neutral-500" : "text-neutral-500"}>
							{t("pricing.assets")}
						</p>
						<p className={isDark ? "text-white" : "text-black"}>
							{assets.data?.assets.length ?? 0}
						</p>
					</div>
					<div>
						<p className={isDark ? "text-neutral-500" : "text-neutral-500"}>
							{t("pricing.pairs")}
						</p>
						<p className={isDark ? "text-white" : "text-black"}>
							{pairs.data?.pairs.length ?? 0}
						</p>
					</div>
					<div>
						<p className={isDark ? "text-neutral-500" : "text-neutral-500"}>
							{t("pricing.networks")}
						</p>
						<p className={isDark ? "text-white" : "text-black"}>
							{networks.data?.networks.length ?? 0}
						</p>
					</div>
				</div>
				{(assets.isError || pairs.isError || networks.isError) && (
					<p className="mt-2 text-xs text-red-500">
						{t("pricing.metadataUnavailable")}
					</p>
				)}
			</Panel>
		</div>
	);
};
