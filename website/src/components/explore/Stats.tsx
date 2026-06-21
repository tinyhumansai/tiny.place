"use client";

import type { ExplorerOverview } from "@tinyhumansai/tinyplace";

import { minorUnitsToDecimal } from "@src/common/format-amount";
import type { FunctionComponent } from "@src/common/types";
import { Chip } from "@src/components/ui/Chip";
import { useExplorerOverview } from "@src/hooks/use-explorer";
import { useTabRoute } from "@src/hooks/use-tab-route";

import { Pricing } from "./Pricing";

type Metric = {
	label: string;
	value: string;
};

function formatNumber(value: number): string {
	if (value >= 1_000_000) {
		return `${(value / 1_000_000).toFixed(1)}M`;
	}
	if (value >= 1_000) {
		return `${(value / 1_000).toFixed(1)}K`;
	}
	return value.toLocaleString();
}

function formatUsd(value: string): string {
	// Volume arrives in 6-decimal base units (e.g. "1000000" = $1), so convert
	// to dollars before compacting — otherwise figures read 10^6 too large.
	const dollars = Number.parseFloat(minorUnitsToDecimal(value, 6));
	if (Number.isNaN(dollars)) {
		return "$0";
	}
	if (dollars >= 1_000_000) {
		return `$${(dollars / 1_000_000).toFixed(1)}M`;
	}
	if (dollars >= 1_000) {
		return `$${(dollars / 1_000).toFixed(1)}K`;
	}
	return `$${dollars.toFixed(2)}`;
}

function buildMetrics(data: ExplorerOverview): Array<Metric> {
	return [
		{
			label: "Total Agents",
			value: formatNumber(data.allTime.registeredAgents),
		},
		{
			label: "Total Volume",
			value: formatUsd(data.allTime.volumeUsd),
		},
		{
			label: "24h Transactions",
			value: formatNumber(data.last24h.transactions),
		},
		{
			label: "24h Volume",
			value: formatUsd(data.last24h.volumeUsd),
		},
		{
			label: "Active Agents",
			value: formatNumber(data.last24h.uniqueAgents),
		},
		{
			label: "Total Entries",
			value: formatNumber(data.ledger.totalEntries),
		},
	];
}

type GeneralProperties = {
	isDark: boolean;
};

const General = ({ isDark }: GeneralProperties): FunctionComponent => {
	const { data, isLoading, isError, error } = useExplorerOverview();

	if (isLoading) {
		return (
			<div className="grid grid-cols-3 gap-3">
				{Array.from({ length: 6 }).map((_, index) => (
					<div
						key={index}
						className={`animate-pulse rounded-lg border p-3 ${
							isDark
								? "border-neutral-800 bg-neutral-950"
								: "border-neutral-200 bg-neutral-50"
						}`}
					>
						<div
							className={`h-3 w-16 rounded ${isDark ? "bg-neutral-800" : "bg-neutral-200"}`}
						/>
						<div
							className={`mt-2 h-5 w-20 rounded ${isDark ? "bg-neutral-800" : "bg-neutral-200"}`}
						/>
					</div>
				))}
			</div>
		);
	}

	if (isError) {
		return (
			<div
				className={`rounded-lg border p-4 ${
					isDark
						? "border-red-900 bg-red-950 text-red-400"
						: "border-red-200 bg-red-50 text-red-600"
				}`}
			>
				<p className="text-sm">
					Failed to load stats
					{error instanceof Error ? `: ${error.message}` : ""}
				</p>
			</div>
		);
	}

	if (!data) {
		return null;
	}

	const metrics = buildMetrics(data);

	return (
		<div className="space-y-4">
			<div className="grid grid-cols-3 gap-3">
				{metrics.map((metric) => (
					<div
						key={metric.label}
						className={`rounded-lg border p-3 ${
							isDark
								? "border-neutral-800 bg-neutral-950"
								: "border-neutral-200 bg-neutral-50"
						}`}
					>
						<p
							className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
						>
							{metric.label}
						</p>
						<p
							className={`mt-1 text-lg font-bold ${isDark ? "text-white" : "text-black"}`}
						>
							{metric.value}
						</p>
					</div>
				))}
			</div>
		</div>
	);
};

const tabs = ["general", "pricing"] as const;

type Tab = (typeof tabs)[number];

const tabLabels: Record<Tab, string> = {
	general: "General",
	pricing: "Pricing",
};

const tabComponents: Record<Tab, React.ComponentType<{ isDark: boolean }>> = {
	general: General,
	pricing: Pricing,
};

type StatsProperties = {
	isDark: boolean;
};

export const Stats = ({ isDark }: StatsProperties): FunctionComponent => {
	const { activeTab, setTab } = useTabRoute<Tab>(tabs, "general");

	const ActiveComponent = tabComponents[activeTab];

	return (
		<div className="space-y-3">
			<div className="flex gap-1">
				{tabs.map((tab) => (
					<Chip
						key={tab}
						active={activeTab === tab}
						isDark={isDark}
						onClick={(): void => {
							setTab(tab);
						}}
					>
						{tabLabels[tab]}
					</Chip>
				))}
			</div>
			<ActiveComponent isDark={isDark} />
		</div>
	);
};
