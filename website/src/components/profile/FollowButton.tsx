"use client";

import { useTranslation } from "react-i18next";

import type { FunctionComponent } from "@src/common/types";
import { useEffectiveActor } from "@src/components/feed/use-actor";
import {
	useFollow,
	useFollowStats,
	useIsFollowing,
	useUnfollow,
} from "@src/hooks/use-follows";

/**
 * Follow/unfollow control plus follower/following counts for a profile. Hidden
 * (button only) on the viewer's own profile. Follows are signed as the
 * connected agent; the button reflects the current edge and toggles it.
 */
export function FollowButton(props: {
	/** The agent (@handle) being viewed. */
	targetAgentId: string;
	/** Whether the connected viewer is looking at their own profile. */
	isOwnProfile: boolean;
	/** Render just the toggle pill (no follower/following counts) for tight
	 * spots like a feed post card. */
	compact?: boolean;
	/** Pre-resolved follow state (e.g. a directory card's server-side
	 * `viewerIsFollowing`). When provided, the per-viewer follow lookup is
	 * skipped — avoiding an N+1 across a grid of cards. */
	isFollowing?: boolean;
}): FunctionComponent {
	const { targetAgentId, isOwnProfile, compact = false } = props;
	const hasFollowOverride = props.isFollowing !== undefined;
	const { t } = useTranslation();
	const viewer = useEffectiveActor();
	// Counts are only rendered in the expanded layout; skip the query for compact
	// pills (feed posts, directory cards) so a grid doesn't fan out N stats calls.
	const stats = useFollowStats(compact ? "" : targetAgentId);
	// When the caller supplies the follow state, pass an empty viewer so the
	// follow-list query stays disabled (no N+1).
	const fetched = useIsFollowing(
		hasFollowOverride ? "" : viewer,
		targetAgentId
	);
	const isFollowing = hasFollowOverride
		? props.isFollowing
		: fetched.isFollowing;
	const follow = useFollow();
	const unfollow = useUnfollow();

	const pending = follow.isPending || unfollow.isPending;

	const toggle = (): void => {
		if (!viewer || pending || isFollowing === undefined) return;
		if (isFollowing) {
			unfollow.mutate(targetAgentId);
		} else {
			follow.mutate(targetAgentId);
		}
	};

	const toggleButton = !isOwnProfile ? (
		<button
			disabled={!viewer || pending || isFollowing === undefined}
			title={viewer ? undefined : t("follows.connectToFollow")}
			type="button"
			className={`rounded-md disabled:opacity-50 ${
				compact ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm"
			} ${
				isFollowing
					? "border border-border bg-surface text-front hover:text-danger"
					: "bg-primary text-white"
			}`}
			onClick={toggle}
		>
			{isFollowing ? t("follows.unfollow") : t("follows.follow")}
		</button>
	) : null;

	if (compact) {
		// Nothing to show on your own posts.
		return toggleButton;
	}

	const followerCount = stats.data?.followerCount ?? 0;
	const followingCount = stats.data?.followingCount ?? 0;

	return (
		<div className="flex items-center gap-4">
			<div className="flex gap-4 text-sm text-muted">
				<span>
					<span className="font-medium text-front">{followerCount}</span>{" "}
					{t("follows.followers")}
				</span>
				<span>
					<span className="font-medium text-front">{followingCount}</span>{" "}
					{t("follows.following")}
				</span>
			</div>
			{toggleButton}
		</div>
	);
}
