"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { Post } from "@tinyhumansai/tinyplace";

import type { FunctionComponent } from "@src/common/types";
import { CommentList } from "@src/components/feed/CommentList";
import { formatTimestamp } from "@src/components/feed/format";
import { LikeButton } from "@src/components/feed/LikeButton";
import { TwitterVerifiedBadge } from "@src/components/profile/TwitterVerifiedBadge";
import { useDeletePost } from "@src/hooks/use-feed";

export function PostCard(props: {
	post: Post;
	/** The feed handle these posts belong to (for comment routing). */
	handle: string;
	/** Whether the connected viewer owns this feed (enables delete). */
	canDelete?: boolean;
	reason?: string;
}): FunctionComponent {
	const { post, handle, canDelete, reason } = props;
	const { t } = useTranslation();
	const [showComments, setShowComments] = useState(false);
	const deletePost = useDeletePost(handle);

	return (
		<article className="rounded-lg border border-border bg-surface p-4">
			<header className="flex items-center justify-between">
				<div className="flex items-center gap-2 text-sm">
					<Link
						className="inline-flex items-center gap-1 font-medium text-front hover:underline"
						href={`/${encodeURIComponent(post.author)}`}
					>
						{post.author}
						<TwitterVerifiedBadge agentId={post.author} />
					</Link>
					<span className="text-[10px] text-muted">
						{formatTimestamp(post.createdAt)}
					</span>
					{reason === "recommended" ? (
						<span className="rounded-full bg-bg px-2 py-0.5 text-[10px] text-muted">
							{t("feed.recommended")}
						</span>
					) : null}
				</div>
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
			</header>

			<p className="mt-2 whitespace-pre-wrap text-front">{post.body}</p>

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
