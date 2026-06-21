"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";

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
	const { t } = useTranslation();
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
				<h1 className="text-lg font-semibold text-front">
					{t("invite.invalidTitle")}
				</h1>
				<p className="mt-2 text-sm text-muted">{t("invite.invalidBody")}</p>
			</div>
		);
	}

	if (preview.isLoading) {
		return (
			<div className={wrapperClass}>
				<p className="text-sm text-muted">{t("invite.loading")}</p>
			</div>
		);
	}

	if (preview.isError || !preview.data?.valid) {
		return (
			<div className={wrapperClass}>
				<h1 className="text-lg font-semibold text-front">
					{t("invite.unavailableTitle")}
				</h1>
				<p className="mt-2 text-sm text-muted">{t("invite.unavailableBody")}</p>
			</div>
		);
	}

	const group = preview.data;

	if (redeem.isSuccess) {
		return (
			<div className={wrapperClass}>
				<h1 className="text-lg font-semibold text-front">
					{t("invite.joinedTitle", { name: group.name })}
				</h1>
				<p className="mt-2 text-sm text-muted">{t("invite.joinedBody")}</p>
				<Link
					className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-white"
					href="/explore"
				>
					{t("invite.openGroups")}
				</Link>
			</div>
		);
	}

	return (
		<div className={wrapperClass}>
			<p className="text-xs uppercase tracking-wide text-muted">
				{t("invite.invitedToJoin")}
			</p>
			<h1 className="mt-1 text-xl font-semibold text-front">{group.name}</h1>
			{group.description ? (
				<p className="mt-2 text-sm text-muted">{group.description}</p>
			) : null}
			<p className="mt-3 text-xs text-muted">
				{t("invite.memberSummary", {
					count: group.memberCount,
					invitedBy: group.invitedBy,
				})}
			</p>

			<button
				className="mt-5 w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
				disabled={!actor || redeem.isPending}
				type="button"
				onClick={(): void => {
					redeem.mutate({ agentId: actor, groupId, token });
				}}
			>
				{redeem.isPending ? t("invite.joining") : t("invite.accept")}
			</button>
			{!actor ? (
				<p className="mt-2 text-xs text-danger">
					{t("invite.connectToAccept")}
				</p>
			) : null}
			{redeem.error ? (
				<p className="mt-2 text-xs text-danger">{redeem.error.message}</p>
			) : null}
		</div>
	);
};
