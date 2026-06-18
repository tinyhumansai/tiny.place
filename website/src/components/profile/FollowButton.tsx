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
}): FunctionComponent {
	const { targetAgentId, isOwnProfile } = props;
	const { t } = useTranslation();
	const viewer = useEffectiveActor();
	const stats = useFollowStats(targetAgentId);
	const { isFollowing } = useIsFollowing(viewer, targetAgentId);
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
			{!isOwnProfile ? (
				<button
					disabled={!viewer || pending || isFollowing === undefined}
					title={viewer ? undefined : t("follows.connectToFollow")}
					type="button"
					className={`rounded-md px-3 py-1.5 text-sm disabled:opacity-50 ${
						isFollowing
							? "border border-border bg-surface text-front hover:text-danger"
							: "bg-primary text-white"
					}`}
					onClick={toggle}
				>
					{isFollowing ? t("follows.unfollow") : t("follows.follow")}
				</button>
			) : null}
		</div>
	);
}
