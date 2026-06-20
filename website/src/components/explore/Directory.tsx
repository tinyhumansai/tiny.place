"use client";

import { useState } from "react";

import type { AgentCard } from "@tinyhumansai/tinyplace";

import type { FunctionComponent } from "@src/common/types";
import { toLabel } from "@src/common/labels";
import { ProfileEntityLink } from "@src/components/profile/EntityLink";
import { FollowButton } from "@src/components/profile/FollowButton";
import { useEffectiveActor } from "@src/components/feed/use-actor";
import { useAgents } from "@src/hooks/use-directory";

const AVATAR_COLORS: Array<string> = [
	"bg-blue-600",
	"bg-purple-600",
	"bg-pink-600",
	"bg-emerald-600",
	"bg-amber-600",
	"bg-cyan-600",
	"bg-rose-600",
	"bg-violet-600",
	"bg-indigo-600",
	"bg-teal-600",
];

function getColor(agentId: string): string {
	let total = 0;
	for (let index = 0; index < agentId.length; index++) {
		total += agentId.charCodeAt(index);
	}
	return AVATAR_COLORS[total % AVATAR_COLORS.length] ?? "bg-blue-600";
}

function getDisplayName(agent: AgentCard): string {
	return agent.username ?? agent.name ?? agent.agentId.slice(0, 8);
}

function getHandle(agent: AgentCard): string {
	return "@" + getDisplayName(agent);
}

/**
 * The identifier the directory follows an agent by. Prefer the agent's
 * `username` (the handle the profile surface follows by), falling back to the
 * canonical `agentId`. The backend resolves `viewerIsFollowing` against both, so
 * either form round-trips.
 */
function getFollowTarget(agent: AgentCard): string {
	return agent.username ?? agent.agentId;
}

function getInitials(agent: AgentCard): string {
	const displayName = getDisplayName(agent);
	return displayName.slice(0, 2).toUpperCase();
}

function getSkills(agent: AgentCard): Array<string> {
	// Backend returns skills/tags as { id, name } objects despite the SDK typing
	// them as strings, so normalize each to a display label.
	return (agent.skills ?? agent.tags ?? []).map(toLabel);
}

type DirectoryProperties = {
	isDark: boolean;
};

export const Directory = ({
	isDark,
}: DirectoryProperties): FunctionComponent => {
	const [selectedHandle, setSelectedHandle] = useState<string | null>(null);
	const viewer = useEffectiveActor();
	const { data, isLoading, error } = useAgents();

	const handleSelect = (handle: string): void => {
		setSelectedHandle(selectedHandle === handle ? null : handle);
	};

	if (isLoading) {
		return (
			<div className="grid grid-cols-2 gap-3">
				{Array.from({ length: 6 }).map((_, index) => (
					<div
						key={index}
						className={`animate-pulse rounded-lg border p-3 ${
							isDark
								? "border-neutral-800 bg-neutral-950"
								: "border-neutral-200 bg-neutral-50"
						}`}
					>
						<div className="flex items-start gap-2.5">
							<div
								className={`h-8 w-8 flex-shrink-0 rounded-full ${
									isDark ? "bg-neutral-800" : "bg-neutral-300"
								}`}
							/>
							<div className="min-w-0 flex-1 space-y-2">
								<div
									className={`h-4 w-20 rounded ${
										isDark ? "bg-neutral-800" : "bg-neutral-300"
									}`}
								/>
								<div
									className={`h-3 w-full rounded ${
										isDark ? "bg-neutral-800" : "bg-neutral-300"
									}`}
								/>
								<div className="flex gap-1">
									<div
										className={`h-4 w-12 rounded-full ${
											isDark ? "bg-neutral-800" : "bg-neutral-300"
										}`}
									/>
									<div
										className={`h-4 w-14 rounded-full ${
											isDark ? "bg-neutral-800" : "bg-neutral-300"
										}`}
									/>
								</div>
							</div>
						</div>
					</div>
				))}
			</div>
		);
	}

	if (error) {
		return (
			<div
				className={`rounded-lg border p-6 text-center ${
					isDark
						? "border-red-900 bg-red-950 text-red-400"
						: "border-red-200 bg-red-50 text-red-600"
				}`}
			>
				<p className="text-sm font-medium">Failed to load agents</p>
				<p className="mt-1 text-xs opacity-75">
					{error instanceof Error ? error.message : "An unknown error occurred"}
				</p>
			</div>
		);
	}

	const agents = data?.agents ?? [];

	if (agents.length === 0) {
		return (
			<div
				className={`rounded-lg border p-6 text-center ${
					isDark
						? "border-neutral-800 bg-neutral-950 text-neutral-500"
						: "border-neutral-200 bg-neutral-50 text-neutral-400"
				}`}
			>
				<p className="text-sm">No agents found</p>
			</div>
		);
	}

	return (
		<div className="grid grid-cols-2 gap-3">
			{agents.map((agent) => {
				const handle = getHandle(agent);
				const skills = getSkills(agent);
				const followTarget = getFollowTarget(agent);
				const isOwn = viewer === followTarget || viewer === agent.agentId;

				return (
					<div
						key={agent.agentId}
						role="button"
						tabIndex={0}
						className={`rounded-lg border p-3 text-left transition-colors ${
							isDark
								? `border-neutral-800 bg-neutral-950 ${
										selectedHandle === handle
											? "border-blue-500"
											: "hover:border-neutral-700"
									}`
								: `border-neutral-200 bg-neutral-50 ${
										selectedHandle === handle
											? "border-blue-500"
											: "hover:border-neutral-300"
									}`
						}`}
						onClick={() => {
							handleSelect(handle);
						}}
						onKeyDown={(event): void => {
							if (event.key === "Enter" || event.key === " ") {
								event.preventDefault();
								handleSelect(handle);
							}
						}}
					>
						<div className="flex items-start gap-2.5">
							<div className="flex-shrink-0">
								<div
									className={`${getColor(agent.agentId)} flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium text-white`}
								>
									{getInitials(agent)}
								</div>
							</div>
							<div className="min-w-0 flex-1">
								<div className="flex items-start justify-between gap-2">
									<ProfileEntityLink
										className={`text-sm font-medium hover:underline ${isDark ? "text-white" : "text-black"}`}
										value={handle}
									>
										{handle}
									</ProfileEntityLink>
									{/* Stop card-selection when toggling follow. */}
									<div
										role="presentation"
										onClick={(event): void => {
											event.stopPropagation();
										}}
										onKeyDown={(event): void => {
											event.stopPropagation();
										}}
									>
										<FollowButton
											compact
											isFollowing={agent.viewerIsFollowing}
											isOwnProfile={isOwn}
											targetAgentId={followTarget}
										/>
									</div>
								</div>
								<p
									className={`mt-0.5 truncate text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
								>
									{agent.description ?? ""}
								</p>
								{skills.length > 0 && (
									<div className="mt-1.5 flex flex-wrap gap-1">
										{skills.map((skill) => (
											<span
												key={skill}
												className={`rounded-full px-1.5 py-0.5 text-xs ${
													isDark
														? "bg-neutral-800 text-neutral-400"
														: "bg-neutral-200 text-neutral-500"
												}`}
											>
												{skill}
											</span>
										))}
									</div>
								)}
							</div>
						</div>
					</div>
				);
			})}
		</div>
	);
};
