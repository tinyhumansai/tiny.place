"use client";

import type { AgentProfile, ProfileActivity } from "@tinyhumansai/tinyplace";
import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";

import { formatUsdFromBaseUnits } from "@src/common/format-amount";
import { useProfileActivity } from "@src/hooks/use-profiles";

type ProfileActivityPanelProperties = {
	profile: AgentProfile;
	isDark?: boolean;
};

function themeClasses(isDark: boolean): {
	surface: string;
	heading: string;
	primary: string;
	muted: string;
} {
	return isDark
		? {
				surface: "border-neutral-800 bg-neutral-950",
				heading: "text-neutral-100",
				primary: "text-white",
				muted: "text-neutral-500",
			}
		: {
				surface: "border-neutral-200 bg-white",
				heading: "text-neutral-900",
				primary: "text-neutral-900",
				muted: "text-neutral-400",
			};
}

function ActivityStats({
	activity,
	theme,
}: {
	activity: ProfileActivity;
	theme: ReturnType<typeof themeClasses>;
}): ReactElement {
	const { t } = useTranslation();
	return (
		<dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
			<div>
				<dt className={`text-xs ${theme.muted}`}>
					{t("profile.activity.transactions")}
				</dt>
				<dd className={`text-base font-semibold ${theme.primary}`}>
					{activity.transactionCount}
				</dd>
			</div>
			<div>
				<dt className={`text-xs ${theme.muted}`}>
					{t("profile.activity.volumeUsd")}
				</dt>
				<dd className={`text-base font-semibold ${theme.primary}`}>
					{formatUsdFromBaseUnits(activity.totalVolumeUsd)}
				</dd>
			</div>
			<div>
				<dt className={`text-xs ${theme.muted}`}>
					{t("profile.activity.counterparties")}
				</dt>
				<dd className={`text-base font-semibold ${theme.primary}`}>
					{activity.uniqueCounterparties}
				</dd>
			</div>
		</dl>
	);
}

export function ProfileActivityPanel({
	profile,
	isDark = false,
}: ProfileActivityPanelProperties): ReactElement {
	const { t } = useTranslation();
	const theme = themeClasses(isDark);
	const activityQuery = useProfileActivity(profile.username);
	const activity = profile.activity ?? activityQuery.data;

	return (
		<section className={`rounded-lg border p-4 ${theme.surface}`}>
			<h2 className={`mb-3 text-sm font-medium ${theme.heading}`}>
				{t("profile.activity.title")}
			</h2>
			{activity ? (
				<ActivityStats activity={activity} theme={theme} />
			) : activityQuery.isLoading ? (
				<p className={`text-sm ${theme.muted}`}>
					{t("profile.activity.loading")}
				</p>
			) : (
				<p className={`text-sm ${theme.muted}`}>
					{t("profile.activity.empty")}
				</p>
			)}
		</section>
	);
}
