"use client";

import { useTranslation } from "react-i18next";

import type { FunctionComponent } from "@src/common/types";
import { useConstitution } from "@src/hooks/use-constitution";

type EscalationLevel = {
	level: string;
	labelKey: string;
	color: string;
};

const escalationLevels: Array<EscalationLevel> = [
	{
		level: "1",
		labelKey: "constitution.escalation.warning",
		color: "text-amber-500",
	},
	{
		level: "2",
		labelKey: "constitution.escalation.suspension",
		color: "text-orange-500",
	},
	{
		level: "3",
		labelKey: "constitution.escalation.permanentBan",
		color: "text-red-500",
	},
];

type ConstitutionProperties = {
	isDark: boolean;
};

export const Constitution = ({
	isDark,
}: ConstitutionProperties): FunctionComponent => {
	const { t } = useTranslation();
	const { data, isLoading, isError } = useConstitution();
	const rules = data?.rules ?? [];

	return (
		<div className="space-y-4">
			<div
				className={`rounded-lg border p-3 ${
					isDark
						? "border-neutral-800 bg-neutral-950"
						: "border-neutral-200 bg-neutral-50"
				}`}
			>
				<span
					className={`text-sm font-medium ${isDark ? "text-white" : "text-black"}`}
				>
					{t("constitution.publicContentRules")}
				</span>
				{isLoading && (
					<p
						className={`mt-2 text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
					>
						{t("constitution.loading")}
					</p>
				)}
				{isError && (
					<p className="mt-2 text-xs text-rose-500">
						{t("constitution.loadError")}
					</p>
				)}
				{!isLoading && !isError && rules.length === 0 && (
					<p
						className={`mt-2 text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
					>
						{t("constitution.noRules")}
					</p>
				)}
				<ol className="mt-2 space-y-2">
					{rules.map((rule, index) => (
						<li key={rule.id} className="flex gap-2">
							<span
								className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-medium ${
									isDark
										? "bg-neutral-800 text-neutral-400"
										: "bg-neutral-200 text-neutral-500"
								}`}
							>
								{index + 1}
							</span>
							<div className="min-w-0">
								<span
									className={`text-xs font-medium ${isDark ? "text-white" : "text-black"}`}
								>
									{rule.title}
								</span>
								<p
									className={`mt-0.5 text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
								>
									{rule.description}
								</p>
							</div>
						</li>
					))}
				</ol>
			</div>
			<div
				className={`rounded-lg border p-3 ${
					isDark
						? "border-neutral-800 bg-neutral-950"
						: "border-neutral-200 bg-neutral-50"
				}`}
			>
				<span
					className={`text-sm font-medium ${isDark ? "text-white" : "text-black"}`}
				>
					{t("constitution.enforcement")}
				</span>
				<div className="mt-2 flex items-center gap-2">
					{escalationLevels.map((level, index) => (
						<div key={level.level} className="flex items-center gap-2">
							<div className="text-center">
								<span className={`block text-xs font-medium ${level.color}`}>
									{t(level.labelKey, { defaultValue: level.labelKey })}
								</span>
								<span
									className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
								>
									{t("constitution.level", { level: level.level })}
								</span>
							</div>
							{index < escalationLevels.length - 1 && (
								<span
									className={`text-xs ${isDark ? "text-neutral-700" : "text-neutral-300"}`}
								>
									→
								</span>
							)}
						</div>
					))}
				</div>
			</div>
			{data ? (
				<p
					className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
				>
					{t("constitution.versionLine", {
						version: data.version,
						date: data.effectiveDate,
					})}
				</p>
			) : null}
		</div>
	);
};
