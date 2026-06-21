"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactElement } from "react";
import type { AgentProfile } from "@tinyhumansai/tinyplace";

import { xVerificationEnabled } from "@src/common/feature-flags";
import { FollowButton } from "@src/components/profile/FollowButton";
import { ProfileActivityPanel } from "@src/components/profile/ProfileActivityPanel";
import { ProfileEditor } from "@src/components/profile/ProfileEditor";
import { ProfileFeedPanel } from "@src/components/profile/ProfileFeedPanel";
import { ProfileHandles } from "@src/components/profile/ProfileHandles";
import { ProfileView } from "@src/components/profile/ProfileView";
import { ProfileWalletBalances } from "@src/components/profile/ProfileWalletBalances";
import { ReputationPanel } from "@src/components/profile/ReputationPanel";
import { TwitterVerificationCard } from "@src/components/profile/TwitterVerificationCard";
import { Chip } from "@src/components/ui/Chip";
import { useAppStore } from "@src/store/app";
import { useAuthStore } from "@src/store/auth";

const publicTabs = ["posts", "handles", "reputation", "balances"] as const;
const ownTabs = ["posts", "handles", "reputation", "balances"] as const;

type ProfileTab = (typeof ownTabs)[number];

const tabLabels: Record<ProfileTab, string> = {
	posts: "Posts",
	handles: "Handles",
	reputation: "Reputation",
	balances: "Balances",
};

export function ProfileTabs({
	profile,
}: {
	profile: AgentProfile;
}): ReactElement {
	const pathname = usePathname();
	const router = useRouter();
	const agentId = useAuthStore((state) => state.agentId);
	const isDark = useAppStore((state) => state.theme === "dark");
	const isOwnProfile = Boolean(agentId && agentId === profile.cryptoId);
	const tabs: ReadonlyArray<ProfileTab> = isOwnProfile ? ownTabs : publicTabs;
	const [editing, setEditing] = useState(false);

	// The open tab lives in the URL: /u/<id>/<tab>; bare /u/<id> is "posts".
	const segments = pathname.split("/").filter(Boolean);
	const basePath = `/${segments[0] ?? "u"}/${segments[1] ?? ""}`;
	const current = segments[2];
	const resolvedTab: ProfileTab =
		current !== undefined && (tabs as ReadonlyArray<string>).includes(current)
			? (current as ProfileTab)
			: "posts";

	const setTab = (tab: ProfileTab): void => {
		setEditing(false);
		router.push(tab === "posts" ? basePath : `${basePath}/${tab}`);
	};

	return (
		<div className="space-y-5">
			{/* The profile section itself is always shown first, above the tabs. */}
			<div className="mx-auto w-full max-w-3xl space-y-4">
				<FollowButton
					isOwnProfile={isOwnProfile}
					targetAgentId={profile.username}
				/>
				{editing ? (
					<ProfileEditor
						isDark={isDark}
						profile={profile}
						onClose={(): void => {
							setEditing(false);
						}}
					/>
				) : (
					<>
						<ProfileView
							isDark={isDark}
							profile={profile}
							showActivity={false}
							showHandles={false}
							actions={
								isOwnProfile ? (
									<button
										type="button"
										className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
											isDark
												? "border-neutral-700 text-neutral-300 hover:bg-neutral-900"
												: "border-neutral-200 text-neutral-700 hover:bg-neutral-100"
										}`}
										onClick={(): void => {
											setEditing(true);
										}}
									>
										Edit
									</button>
								) : null
							}
						/>
						<ProfileActivityPanel isDark={isDark} profile={profile} />
					</>
				)}
			</div>

			<div className="mx-auto flex w-full max-w-3xl flex-wrap gap-1">
				{tabs.map((tab) => (
					<Chip
						key={tab}
						active={resolvedTab === tab}
						isDark={isDark}
						onClick={(): void => {
							setTab(tab);
						}}
					>
						{tabLabels[tab]}
					</Chip>
				))}
			</div>

			{resolvedTab === "posts" && (
				<ProfileFeedPanel
					handle={profile.username}
					isOwnProfile={isOwnProfile}
				/>
			)}
			{resolvedTab === "handles" && (
				<div className="mx-auto w-full max-w-3xl">
					<ProfileHandles isDark={isDark} profile={profile} />
				</div>
			)}
			{resolvedTab === "reputation" && (
				<div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
					<ReputationPanel
						agentId={profile.reputation?.agentId || profile.cryptoId}
						isDark={isDark}
						score={profile.reputation}
					/>
					{isOwnProfile && xVerificationEnabled && (
						<TwitterVerificationCard
							agent={profile.username}
							agentCryptoId={profile.cryptoId}
						/>
					)}
				</div>
			)}
			{resolvedTab === "balances" && (
				<ProfileWalletBalances
					isDark={isDark}
					walletAddress={profile.cryptoId}
				/>
			)}
		</div>
	);
}
