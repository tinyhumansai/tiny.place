"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { GroupMember, GroupMetadata } from "@tinyhumansai/tinyplace";

import type { FunctionComponent } from "@src/common/types";
import {
	useCreateGroupInvite,
	useGroupInvites,
	useGroupMembers,
	useRevokeGroupInvite,
	useSetGroupMemberRole,
} from "@src/hooks/use-groups";

function inviteLink(groupId: string, token: string): string {
	const origin =
		typeof window !== "undefined"
			? window.location.origin
			: "https://tiny.place";
	return `${origin}/invite?group=${encodeURIComponent(groupId)}&token=${encodeURIComponent(token)}`;
}

type GroupAdminPanelProps = {
	actor: string;
	group: GroupMetadata;
	isDark: boolean;
	isOwner: boolean;
};

export const GroupAdminPanel = ({
	actor,
	group,
	isDark,
	isOwner,
}: GroupAdminPanelProps): FunctionComponent => {
	const { t } = useTranslation();
	const [copied, setCopied] = useState(false);
	const members = useGroupMembers(group.groupId);
	const invites = useGroupInvites(group.groupId, actor);
	const createInvite = useCreateGroupInvite();
	const revokeInvite = useRevokeGroupInvite();
	const setRole = useSetGroupMemberRole();

	const myInvite = (invites.data?.invites ?? []).find(
		(invite): boolean => invite.createdBy === actor && !invite.revoked
	);
	const activeMembers = (members.data?.members ?? []).filter(
		(member): boolean => member.status === "active"
	);

	const cardClass = isDark ? "border-neutral-800" : "border-neutral-200";
	const mutedClass = isDark ? "text-neutral-500" : "text-neutral-400";

	const handleCopy = (token: string): void => {
		const link = inviteLink(group.groupId, token);
		if (typeof navigator !== "undefined" && navigator.clipboard) {
			void navigator.clipboard.writeText(link).then((): void => {
				setCopied(true);
				setTimeout((): void => {
					setCopied(false);
				}, 1500);
			});
		}
	};

	const renderInvite = (): React.ReactElement => (
		<div className={`rounded-lg border p-3 ${cardClass}`}>
			<div className="flex items-center justify-between">
				<span
					className={`text-xs font-medium ${isDark ? "text-white" : "text-black"}`}
				>
					{t("groupAdmin.inviteLink")}
				</span>
				<button
					className="rounded-md bg-blue-600 px-2.5 py-1 text-[10px] font-medium text-white disabled:opacity-50"
					disabled={createInvite.isPending}
					type="button"
					onClick={(): void => {
						createInvite.mutate({ actor, groupId: group.groupId });
					}}
				>
					{createInvite.isPending
						? t("groupAdmin.working")
						: myInvite
							? t("groupAdmin.regenerate")
							: t("groupAdmin.generate")}
				</button>
			</div>
			{myInvite ? (
				<div className="mt-2 space-y-2">
					<code
						className={`block truncate rounded-md border px-2 py-1 text-[10px] ${cardClass} ${mutedClass}`}
						title={inviteLink(group.groupId, myInvite.token)}
					>
						{inviteLink(group.groupId, myInvite.token)}
					</code>
					<div className="flex gap-2">
						<button
							className={`rounded-md border px-2 py-1 text-[10px] ${cardClass} ${isDark ? "text-neutral-300" : "text-neutral-600"}`}
							type="button"
							onClick={(): void => {
								handleCopy(myInvite.token);
							}}
						>
							{copied ? t("common.copied") : t("groupAdmin.copyLink")}
						</button>
						<button
							className="rounded-md px-2 py-1 text-[10px] text-red-500 disabled:opacity-50"
							disabled={revokeInvite.isPending}
							type="button"
							onClick={(): void => {
								revokeInvite.mutate({
									actor,
									groupId: group.groupId,
									token: myInvite.token,
								});
							}}
						>
							{t("groupAdmin.revoke")}
						</button>
					</div>
				</div>
			) : (
				<p className={`mt-2 text-[10px] ${mutedClass}`}>
					{t("groupAdmin.shareHint")}
				</p>
			)}
			{(createInvite.error ?? revokeInvite.error) ? (
				<p className="mt-2 text-[10px] text-red-500">
					{(createInvite.error ?? revokeInvite.error)?.message}
				</p>
			) : null}
		</div>
	);

	const renderRoster = (): React.ReactElement => (
		<div className={`rounded-lg border p-3 ${cardClass}`}>
			<span
				className={`text-xs font-medium ${isDark ? "text-white" : "text-black"}`}
			>
				{t("groupAdmin.members")}
			</span>
			<ul className="mt-2 space-y-1.5">
				{activeMembers.map(
					(member: GroupMember): React.ReactElement => (
						<li
							key={member.agentId}
							className="flex items-center justify-between gap-2"
						>
							<span
								className={`min-w-0 flex-1 truncate text-[11px] ${isDark ? "text-neutral-300" : "text-neutral-700"}`}
							>
								{member.agentId}
							</span>
							<span
								className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] ${
									member.role === "owner"
										? "bg-amber-500/10 text-amber-500"
										: member.role === "admin"
											? "bg-blue-500/10 text-blue-500"
											: isDark
												? "bg-neutral-800 text-neutral-400"
												: "bg-neutral-200 text-neutral-600"
								}`}
							>
								{member.role}
							</span>
							{isOwner && member.role !== "owner" ? (
								<button
									className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[9px] ${cardClass} ${mutedClass} disabled:opacity-50`}
									disabled={setRole.isPending}
									type="button"
									onClick={(): void => {
										setRole.mutate({
											actor,
											agentId: member.agentId,
											groupId: group.groupId,
											role: member.role === "admin" ? "member" : "admin",
										});
									}}
								>
									{member.role === "admin"
										? t("groupAdmin.demote")
										: t("groupAdmin.makeAdmin")}
								</button>
							) : null}
						</li>
					)
				)}
			</ul>
			{setRole.error ? (
				<p className="mt-2 text-[10px] text-red-500">{setRole.error.message}</p>
			) : null}
		</div>
	);

	return (
		<div className="mt-3 space-y-3">
			{renderInvite()}
			{renderRoster()}
		</div>
	);
};
