"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type {
	AdminAuditEntry,
	AdminFeeMetrics,
	FeeConfig,
	FeeResolveResponse,
	LedgerType,
} from "@tinyhumansai/tinyplace";

import type { FunctionComponent } from "@src/common/types";
import {
	ADMIN_FEE_TYPES,
	useAdminAudit,
	useAdminConfig,
	useAdminFeeMetrics,
	useAdminFeeResolution,
	useAdminFees,
	useUpdateAdminConfig,
} from "@src/hooks/use-admin";

type AdminProperties = {
	isDark: boolean;
};

function panelClass(isDark: boolean): string {
	return `rounded-lg border p-4 ${
		isDark
			? "border-neutral-800 bg-neutral-950"
			: "border-neutral-200 bg-neutral-50"
	}`;
}

function inputClass(isDark: boolean): string {
	return `rounded-md border px-2.5 py-1.5 text-xs ${
		isDark
			? "border-neutral-700 bg-neutral-900 text-white placeholder-neutral-600"
			: "border-neutral-300 bg-white text-black placeholder-neutral-400"
	}`;
}

function labelClass(isDark: boolean): string {
	return `text-xs font-medium ${isDark ? "text-neutral-400" : "text-neutral-500"}`;
}

function formatDate(value: string | undefined): string {
	if (!value) {
		return "-";
	}
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return value;
	}
	return date.toLocaleString(undefined, {
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		month: "short",
	});
}

function errorMessage(error: unknown, t: TFunction): string {
	if (error instanceof Error && error.message.includes("403")) {
		return t("admin.credentialsRequired");
	}
	if (error instanceof Error) {
		return error.message;
	}
	return t("admin.unavailableFromStaging");
}

function DataState({
	children,
	error,
	isDark,
	isError,
	isLoading,
}: {
	children: React.ReactNode;
	error: unknown;
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
		return <p className="text-xs text-red-500">{errorMessage(error, t)}</p>;
	}
	return <>{children}</>;
}

function SectionTitle({
	isDark,
	title,
}: {
	isDark: boolean;
	title: string;
}): React.ReactElement {
	return (
		<h3
			className={`mb-3 text-sm font-medium ${isDark ? "text-white" : "text-black"}`}
		>
			{title}
		</h3>
	);
}

function ConfigPanel({
	config,
	isDark,
}: {
	config: Record<string, string>;
	isDark: boolean;
}): React.ReactElement {
	const { t } = useTranslation();
	const entries = Object.entries(config).sort(([left], [right]) =>
		left.localeCompare(right)
	);
	if (entries.length === 0) {
		return (
			<p className="text-xs text-neutral-500">{t("admin.noConfigReturned")}</p>
		);
	}
	return (
		<div className="space-y-2">
			{entries.map(([key, value]) => (
				<div
					key={key}
					className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 ${
						isDark
							? "border-neutral-800 bg-neutral-900"
							: "border-neutral-200 bg-white"
					}`}
				>
					<span
						className={`text-xs ${isDark ? "text-neutral-300" : "text-neutral-700"}`}
					>
						{key}
					</span>
					<span
						className={`font-mono text-xs ${isDark ? "text-white" : "text-black"}`}
					>
						{value}
					</span>
				</div>
			))}
		</div>
	);
}

function FeePanel({
	fees,
	isDark,
}: {
	fees: Array<FeeConfig>;
	isDark: boolean;
}): React.ReactElement {
	const { t } = useTranslation();
	if (fees.length === 0) {
		return (
			<p className="text-xs text-neutral-500">{t("admin.noFeeOverrides")}</p>
		);
	}
	return (
		<div className="space-y-2">
			{fees.slice(0, 6).map((fee) => (
				<div
					key={fee.feeId}
					className={`rounded-md border p-3 text-xs ${
						isDark
							? "border-neutral-800 bg-neutral-900"
							: "border-neutral-200 bg-white"
					}`}
				>
					<div className="flex items-center justify-between gap-3">
						<span className={isDark ? "text-white" : "text-black"}>
							{fee.scope} / {fee.transactionType}
						</span>
						<span className="font-mono text-emerald-500">{fee.rate}</span>
					</div>
					<p
						className={`mt-1 ${isDark ? "text-neutral-500" : "text-neutral-500"}`}
					>
						{fee.agents.length > 0
							? fee.agents.join(" -> ")
							: t("admin.global")}{" "}
						- {fee.reason || fee.feeId}
					</p>
				</div>
			))}
		</div>
	);
}

function MetricsPanel({
	isDark,
	metrics,
}: {
	isDark: boolean;
	metrics: AdminFeeMetrics;
}): React.ReactElement {
	const { t } = useTranslation();
	const items = [
		[t("admin.metricCount"), String(metrics.count)],
		[t("admin.metricTotal"), metrics.total],
		[t("admin.metricLast24h"), metrics.last24h],
		[t("admin.metricLast30d"), metrics.last30d],
	];
	return (
		<div className="grid grid-cols-2 gap-2 text-xs">
			{items.map(([label, value]) => (
				<div
					key={label}
					className={`rounded-md border p-2 ${
						isDark
							? "border-neutral-800 bg-neutral-900"
							: "border-neutral-200 bg-white"
					}`}
				>
					<p className={isDark ? "text-neutral-500" : "text-neutral-500"}>
						{label}
					</p>
					<p className={`font-mono ${isDark ? "text-white" : "text-black"}`}>
						{value}
					</p>
				</div>
			))}
		</div>
	);
}

function AuditPanel({
	audit,
	isDark,
}: {
	audit: Array<AdminAuditEntry>;
	isDark: boolean;
}): React.ReactElement {
	const { t } = useTranslation();
	if (audit.length === 0) {
		return (
			<p className="text-xs text-neutral-500">{t("admin.noAuditEntries")}</p>
		);
	}
	return (
		<div className="space-y-2">
			{audit.slice(0, 6).map((entry) => (
				<div
					key={entry.auditId}
					className={`rounded-md border p-3 text-xs ${
						isDark
							? "border-neutral-800 bg-neutral-900"
							: "border-neutral-200 bg-white"
					}`}
				>
					<div className="flex items-center justify-between gap-3">
						<span className={isDark ? "text-white" : "text-black"}>
							{entry.action}
						</span>
						<span className={isDark ? "text-neutral-500" : "text-neutral-500"}>
							{formatDate(entry.timestamp)}
						</span>
					</div>
					<p
						className={`mt-1 ${isDark ? "text-neutral-500" : "text-neutral-500"}`}
					>
						{entry.actor} - {entry.reason || entry.auditId}
					</p>
				</div>
			))}
		</div>
	);
}

function ResolutionPanel({
	isDark,
	resolution,
}: {
	isDark: boolean;
	resolution: FeeResolveResponse | undefined;
}): React.ReactElement {
	const { t } = useTranslation();
	if (!resolution) {
		return (
			<p className="text-xs text-neutral-500">{t("admin.noFeePreview")}</p>
		);
	}
	const { fee } = resolution;
	return (
		<div
			className={`rounded-md border p-3 text-xs ${
				isDark
					? "border-neutral-800 bg-neutral-900"
					: "border-neutral-200 bg-white"
			}`}
		>
			<div className="flex items-center justify-between gap-3">
				<span className={isDark ? "text-white" : "text-black"}>
					{fee.scope} / {fee.transactionType}
				</span>
				<span className="font-mono text-emerald-500">{fee.rate}</span>
			</div>
			<p className={`mt-1 ${isDark ? "text-neutral-500" : "text-neutral-500"}`}>
				{fee.reason || fee.feeId}
			</p>
		</div>
	);
}

export const Admin = ({ isDark }: AdminProperties): FunctionComponent => {
	const { t } = useTranslation();
	const [from, setFrom] = useState("@buyer");
	const [to, setTo] = useState("@seller");
	const [type, setType] = useState<LedgerType>("PAYMENT");
	const [configKey, setConfigKey] = useState("fees.default_rate");
	const [configValue, setConfigValue] = useState("0.002");
	const [configReason, setConfigReason] = useState("operator update");
	const configQuery = useAdminConfig();
	const feesQuery = useAdminFees();
	const metricsQuery = useAdminFeeMetrics();
	const auditQuery = useAdminAudit({ limit: 10 });
	const resolutionQuery = useAdminFeeResolution({ from, to, type });
	const updateConfig = useUpdateAdminConfig();

	const handleConfigSubmit = (event: React.FormEvent): void => {
		event.preventDefault();
		if (!configKey.trim() || !configValue.trim()) {
			return;
		}
		updateConfig.mutate({
			key: configKey.trim(),
			value: configValue.trim(),
			reason: configReason.trim() || undefined,
		});
	};

	return (
		<div className="space-y-4">
			<div className={panelClass(isDark)}>
				<SectionTitle isDark={isDark} title={t("admin.feeResolution")} />
				<div className="mb-3 grid grid-cols-3 gap-2">
					<div>
						<label className={labelClass(isDark)}>{t("admin.from")}</label>
						<input
							className={`${inputClass(isDark)} w-full`}
							type="text"
							value={from}
							onChange={(event): void => {
								setFrom(event.target.value);
							}}
						/>
					</div>
					<div>
						<label className={labelClass(isDark)}>{t("admin.to")}</label>
						<input
							className={`${inputClass(isDark)} w-full`}
							type="text"
							value={to}
							onChange={(event): void => {
								setTo(event.target.value);
							}}
						/>
					</div>
					<div>
						<label className={labelClass(isDark)}>{t("admin.type")}</label>
						<select
							className={`${inputClass(isDark)} w-full`}
							value={type}
							onChange={(event): void => {
								setType(event.target.value as LedgerType);
							}}
						>
							{ADMIN_FEE_TYPES.map((feeType) => (
								<option key={feeType} value={feeType}>
									{feeType}
								</option>
							))}
						</select>
					</div>
				</div>
				<DataState
					error={resolutionQuery.error}
					isDark={isDark}
					isError={resolutionQuery.isError}
					isLoading={resolutionQuery.isLoading}
				>
					<ResolutionPanel isDark={isDark} resolution={resolutionQuery.data} />
				</DataState>
			</div>

			<div className="grid gap-4 lg:grid-cols-2">
				<div className={panelClass(isDark)}>
					<SectionTitle isDark={isDark} title={t("admin.runtimeConfig")} />
					<DataState
						error={configQuery.error}
						isDark={isDark}
						isError={configQuery.isError}
						isLoading={configQuery.isLoading}
					>
						<ConfigPanel
							config={configQuery.data?.config ?? {}}
							isDark={isDark}
						/>
					</DataState>
				</div>

				<form className={panelClass(isDark)} onSubmit={handleConfigSubmit}>
					<SectionTitle isDark={isDark} title={t("admin.updateConfig")} />
					<div className="space-y-2">
						<div>
							<label className={labelClass(isDark)}>{t("admin.key")}</label>
							<input
								className={`${inputClass(isDark)} w-full`}
								type="text"
								value={configKey}
								onChange={(event): void => {
									setConfigKey(event.target.value);
								}}
							/>
						</div>
						<div>
							<label className={labelClass(isDark)}>{t("admin.value")}</label>
							<input
								className={`${inputClass(isDark)} w-full`}
								type="text"
								value={configValue}
								onChange={(event): void => {
									setConfigValue(event.target.value);
								}}
							/>
						</div>
						<div>
							<label className={labelClass(isDark)}>{t("admin.reason")}</label>
							<input
								className={`${inputClass(isDark)} w-full`}
								type="text"
								value={configReason}
								onChange={(event): void => {
									setConfigReason(event.target.value);
								}}
							/>
						</div>
						<button
							disabled={updateConfig.isPending}
							type="submit"
							className={`rounded-md px-3 py-1.5 text-xs font-medium ${
								isDark
									? "bg-white text-black disabled:bg-neutral-800 disabled:text-neutral-500"
									: "bg-black text-white disabled:bg-neutral-200 disabled:text-neutral-500"
							}`}
						>
							{updateConfig.isPending ? t("common.saving") : t("common.save")}
						</button>
						{updateConfig.isError ? (
							<p className="text-xs text-red-500">
								{errorMessage(updateConfig.error, t)}
							</p>
						) : null}
						{updateConfig.isSuccess ? (
							<p className="text-xs text-emerald-500">
								{t("admin.savedKey", { key: updateConfig.data.key })}
							</p>
						) : null}
					</div>
				</form>
			</div>

			<div className="grid gap-4 lg:grid-cols-2">
				<div className={panelClass(isDark)}>
					<SectionTitle isDark={isDark} title={t("admin.feeMetrics")} />
					<DataState
						error={metricsQuery.error}
						isDark={isDark}
						isError={metricsQuery.isError}
						isLoading={metricsQuery.isLoading}
					>
						{metricsQuery.data ? (
							<MetricsPanel isDark={isDark} metrics={metricsQuery.data} />
						) : (
							<p className="text-xs text-neutral-500">{t("admin.noMetrics")}</p>
						)}
					</DataState>
				</div>
			</div>

			<div className="grid gap-4 lg:grid-cols-2">
				<div className={panelClass(isDark)}>
					<SectionTitle isDark={isDark} title={t("admin.feeOverrides")} />
					<DataState
						error={feesQuery.error}
						isDark={isDark}
						isError={feesQuery.isError}
						isLoading={feesQuery.isLoading}
					>
						<FeePanel fees={feesQuery.data?.fees ?? []} isDark={isDark} />
					</DataState>
				</div>

				<div className={panelClass(isDark)}>
					<SectionTitle isDark={isDark} title={t("admin.auditLog")} />
					<DataState
						error={auditQuery.error}
						isDark={isDark}
						isError={auditQuery.isError}
						isLoading={auditQuery.isLoading}
					>
						<AuditPanel audit={auditQuery.data?.audit ?? []} isDark={isDark} />
					</DataState>
				</div>
			</div>
		</div>
	);
};
