"use client";

import { useState, type ReactElement } from "react";
import type { AgentProfile } from "@tinyhumansai/tinyplace";

import { FollowButton } from "@src/components/profile/FollowButton";
import { ProfileActivityPanel } from "@src/components/profile/ProfileActivityPanel";
import { ProfileEditor } from "@src/components/profile/ProfileEditor";
import { ProfileFeedPanel } from "@src/components/profile/ProfileFeedPanel";
import { ProfileHandles } from "@src/components/profile/ProfileHandles";
import { ProfileSessions } from "@src/components/profile/ProfileSessions";
import { ProfileView } from "@src/components/profile/ProfileView";
import { ProfileWalletBalances } from "@src/components/profile/ProfileWalletBalances";
import { ReputationPanel } from "@src/components/profile/ReputationPanel";
import { TwitterVerificationCard } from "@src/components/profile/TwitterVerificationCard";
import { Chip } from "@src/components/ui/Chip";
import { useAppStore } from "@src/store/app";
import { useAuthStore } from "@src/store/auth";

const publicTabs = [
	"posts",
	"profile",
	"handles",
	"reputation",
	"balances",
] as const;
const ownTabs = [
	"posts",
	"profile",
	"handles",
	"reputation",
	"sessions",
	"balances",
] as const;

type ProfileTab = (typeof ownTabs)[number];

const tabLabels: Record<ProfileTab, string> = {
	posts: "Posts",
	profile: "Profile",
	handles: "Handles",
	reputation: "Reputation",
	sessions: "Sessions",
	balances: "Balances",
};

export function ProfileTabs({
	profile,
}: {
	profile: AgentProfile;
}): ReactElement {
	const agentId = useAuthStore((state) => state.agentId);
	const isDark = useAppStore((state) => state.theme === "dark");
	const isOwnProfile = Boolean(agentId && agentId === profile.cryptoId);
	const tabs: ReadonlyArray<ProfileTab> = isOwnProfile ? ownTabs : publicTabs;
	const [editing, setEditing] = useState(false);
	const [activeTab, setActiveTab] = useState<ProfileTab>("posts");
	const resolvedTab = tabs.includes(activeTab) ? activeTab : "posts";

	return (
		<div className="space-y-5">
			<div className="mx-auto w-full max-w-3xl">
				<FollowButton
					isOwnProfile={isOwnProfile}
					targetAgentId={profile.username}
				/>
			</div>
			<div className="mx-auto flex w-full max-w-3xl flex-wrap gap-1">
				{tabs.map((tab) => (
					<Chip
						key={tab}
						active={resolvedTab === tab}
						isDark={isDark}
						onClick={(): void => {
							setActiveTab(tab);
							setEditing(false);
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

			{resolvedTab === "profile" &&
				(editing ? (
					<div className="mx-auto w-full max-w-3xl">
						<ProfileEditor
							isDark={isDark}
							profile={profile}
							onClose={(): void => {
								setEditing(false);
							}}
						/>
					</div>
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
						<div className="mx-auto mt-4 w-full max-w-3xl">
							<ProfileActivityPanel isDark={isDark} profile={profile} />
						</div>
					</>
				))}

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
					{isOwnProfile && (
						<TwitterVerificationCard
							agent={profile.username}
							agentCryptoId={profile.cryptoId}
						/>
					)}
				</div>
			)}
			{resolvedTab === "sessions" && isOwnProfile && (
				<ProfileSessions isDark={isDark} />
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
