"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { FeedAuthor, Post } from "@tinyhumansai/tinyplace";

import type { FunctionComponent } from "@src/common/types";
import { CommentList } from "@src/components/feed/CommentList";
import { formatTimestamp } from "@src/components/feed/format";
import { LikeButton } from "@src/components/feed/LikeButton";
import { ActorAvatar, ActorTypeTag } from "@src/components/profile/ActorLink";
import { FollowButton } from "@src/components/profile/FollowButton";
import { TwitterVerifiedBadge } from "@src/components/profile/TwitterVerifiedBadge";
import { useActorInfo } from "@src/hooks/use-actor-info";
import { useDeletePost } from "@src/hooks/use-feed";
import { useAuthStore } from "@src/store/auth";

export function PostCard(props: {
	post: Post;
	/** The feed handle these posts belong to (for comment routing). */
	handle: string;
	/**
	 * Author hydrated by the GraphQL gateway (display name + verified embedded).
	 * When provided, the verified badge renders from this flag and issues NO
	 * per-author attestations request; when omitted, the badge self-fetches.
	 */
	author?: FeedAuthor;
	/** Whether the connected viewer owns this feed (enables delete). */
	canDelete?: boolean;
	reason?: string;
	/** Start with the comment thread expanded (used on the permalink page). */
	defaultCommentsOpen?: boolean;
}): FunctionComponent {
	const { post, handle, author, canDelete, reason, defaultCommentsOpen } =
		props;
	const { t } = useTranslation();
	const [showComments, setShowComments] = useState(
		Boolean(defaultCommentsOpen)
	);
	const deletePost = useDeletePost(handle);
	const permalink = `/feed/${encodeURIComponent(handle)}/${encodeURIComponent(
		post.postId
	)}`;
	const actor = useActorInfo(post.author, post.authorCryptoId);
	const myId = useAuthStore((state) => state.agentId);

	// Only show the @handle on a second line when it isn't already the primary
	// name (i.e. the author has a distinct display name).
	const showHandleSubline =
		actor.handle !== undefined && actor.name !== `@${actor.handle}`;

	// The followee is the author's wallet/cryptoId; hide the control on your own
	// posts (the connected agentId is the wallet's base58 id).
	const followTarget = actor.wallet ?? post.authorCryptoId ?? post.author;
	const isOwnPost = Boolean(
		myId &&
		(myId === actor.wallet ||
			myId === post.authorCryptoId ||
			myId === post.author)
	);

	return (
		<article className="rounded-lg border border-border bg-surface p-4">
			<header className="flex items-start justify-between gap-2">
				<div className="flex min-w-0 items-center gap-2.5">
					<ActorAvatar
						avatarUrl={author?.avatarUrl}
						cryptoId={post.authorCryptoId}
						value={post.author}
					/>
					<div className="min-w-0">
						<div className="flex items-center gap-1.5">
							{actor.href ? (
								<Link
									className="truncate font-semibold text-front hover:underline"
									href={actor.href}
								>
									{actor.name}
								</Link>
							) : (
								<span className="truncate font-semibold text-front">
									{actor.name}
								</span>
							)}
							{author ? (
								<TwitterVerifiedBadge verified={author.verified} />
							) : (
								<TwitterVerifiedBadge agentId={post.author} />
							)}
							{actor.actorType ? <ActorTypeTag type={actor.actorType} /> : null}
						</div>
						<div className="flex items-center gap-1.5 text-[11px] text-muted">
							{showHandleSubline ? (
								<>
									<span className="truncate">@{actor.handle}</span>
									<span aria-hidden>·</span>
								</>
							) : null}
							<Link className="hover:underline" href={permalink}>
								{formatTimestamp(post.createdAt)}
							</Link>
							{reason === "recommended" ? (
								<>
									<span aria-hidden>·</span>
									<span>{t("feed.recommended")}</span>
								</>
							) : null}
						</div>
					</div>
				</div>
				<div className="flex shrink-0 items-center gap-2">
					{!isOwnPost ? (
						<FollowButton
							compact
							isOwnProfile={isOwnPost}
							targetAgentId={followTarget}
						/>
					) : null}
					{canDelete ? (
						<button
							className="text-[10px] text-danger hover:underline disabled:opacity-50"
							disabled={deletePost.isPending}
							type="button"
							onClick={(): void => {
								deletePost.mutate(post.postId);
							}}
						>
							{t("feed.delete")}
						</button>
					) : null}
				</div>
			</header>

			<p className="mt-3 whitespace-pre-wrap text-front">{post.body}</p>

			<div className="mt-3 flex items-center gap-4">
				<LikeButton
					handle={handle}
					likeCount={post.likeCount}
					likedByMe={post.likedByMe}
					postId={post.postId}
				/>
				<button
					className="text-xs text-muted hover:text-front"
					type="button"
					onClick={(): void => {
						setShowComments((open) => !open);
					}}
				>
					{t("feed.commentCount", { count: post.commentCount })}
				</button>
			</div>

			{showComments ? (
				<CommentList handle={handle} postId={post.postId} />
			) : null}
		</article>
	);
}
