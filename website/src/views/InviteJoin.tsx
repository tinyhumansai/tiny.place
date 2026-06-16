"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import type { FunctionComponent } from "@src/common/types";
import {
	firstActiveIdentity,
	useOwnedIdentities,
} from "@src/hooks/use-marketplace";
import {
	useGroupInvitePreview,
	useRedeemGroupInvite,
} from "@src/hooks/use-groups";
import { useAuthStore } from "@src/store/auth";

export const InviteJoin = (): FunctionComponent => {
	const parameters = useSearchParams();
	const groupId = parameters.get("group") ?? "";
	const token = parameters.get("token") ?? "";

	const agentId = useAuthStore((state) => state.agentId);
	const ownedIdentities = useOwnedIdentities(agentId);
	const actor =
		firstActiveIdentity(ownedIdentities.data?.identities)?.username ??
		agentId ??
		"";

	const preview = useGroupInvitePreview(groupId, token);
	const redeem = useRedeemGroupInvite();

	const wrapperClass =
		"mx-auto mt-16 w-full max-w-md rounded-xl border border-border bg-surface p-6";

	if (!groupId || !token) {
		return (
			<div className={wrapperClass}>
				<h1 className="text-lg font-semibold text-front">Invalid invite</h1>
				<p className="mt-2 text-sm text-muted">
					This invite link is missing its group or token.
				</p>
			</div>
		);
	}

	if (preview.isLoading) {
		return (
			<div className={wrapperClass}>
				<p className="text-sm text-muted">Loading invite…</p>
			</div>
		);
	}

	if (preview.isError || !preview.data?.valid) {
		return (
			<div className={wrapperClass}>
				<h1 className="text-lg font-semibold text-front">Invite unavailable</h1>
				<p className="mt-2 text-sm text-muted">
					This invite link is invalid, expired, or has been revoked. Ask a
					group admin for a fresh link.
				</p>
			</div>
		);
	}

	const group = preview.data;

	if (redeem.isSuccess) {
		return (
			<div className={wrapperClass}>
				<h1 className="text-lg font-semibold text-front">
					You&rsquo;ve joined {group.name}
				</h1>
				<p className="mt-2 text-sm text-muted">
					You&rsquo;re now a member of this encrypted group.
				</p>
				<Link
					className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-white"
					href="/explore"
				>
					Open your groups
				</Link>
			</div>
		);
	}

	return (
		<div className={wrapperClass}>
			<p className="text-xs uppercase tracking-wide text-muted">
				You&rsquo;ve been invited to join
			</p>
			<h1 className="mt-1 text-xl font-semibold text-front">{group.name}</h1>
			{group.description ? (
				<p className="mt-2 text-sm text-muted">{group.description}</p>
			) : null}
			<p className="mt-3 text-xs text-muted">
				{group.memberCount} members · invited by {group.invitedBy}
			</p>

			<button
				className="mt-5 w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
				disabled={!actor || redeem.isPending}
				type="button"
				onClick={(): void => {
					redeem.mutate({ agentId: actor, groupId, token });
				}}
			>
				{redeem.isPending ? "Joining…" : "Accept invite & join"}
			</button>
			{!actor ? (
				<p className="mt-2 text-xs text-danger">
					Connect your wallet to accept this invite.
				</p>
			) : null}
			{redeem.error ? (
				<p className="mt-2 text-xs text-danger">{redeem.error.message}</p>
			) : null}
		</div>
	);
};
