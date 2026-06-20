"use client";

import type { AgentProfile, ProfileActivity } from "@tinyhumansai/tinyplace";
import type { ReactElement } from "react";

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
	t,
}: {
	activity: ProfileActivity;
	t: ReturnType<typeof themeClasses>;
}): ReactElement {
	return (
		<dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
			<div>
				<dt className={`text-xs ${t.muted}`}>Transactions</dt>
				<dd className={`text-base font-semibold ${t.primary}`}>
					{activity.transactionCount}
				</dd>
			</div>
			<div>
				<dt className={`text-xs ${t.muted}`}>Volume (USD)</dt>
				<dd className={`text-base font-semibold ${t.primary}`}>
					{formatUsdFromBaseUnits(activity.totalVolumeUsd)}
				</dd>
			</div>
			<div>
				<dt className={`text-xs ${t.muted}`}>Counterparties</dt>
				<dd className={`text-base font-semibold ${t.primary}`}>
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
	const t = themeClasses(isDark);
	const activityQuery = useProfileActivity(profile.username);
	const activity = profile.activity ?? activityQuery.data;

	return (
		<section className={`rounded-lg border p-4 ${t.surface}`}>
			<h2 className={`mb-3 text-sm font-medium ${t.heading}`}>Activity</h2>
			{activity ? (
				<ActivityStats activity={activity} t={t} />
			) : activityQuery.isLoading ? (
				<p className={`text-sm ${t.muted}`}>Loading activity...</p>
			) : (
				<p className={`text-sm ${t.muted}`}>No activity yet.</p>
			)}
		</section>
	);
}
