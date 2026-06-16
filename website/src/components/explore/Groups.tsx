"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

import type { GroupMember, GroupMetadata } from "@tinyhumansai/tinyplace";

import type { FunctionComponent } from "@src/common/types";
import { useGroupMessages } from "@src/hooks/use-group-messages";
import {
	useCreateGroup,
	useGroupMembers,
	useGroups,
	useJoinGroup,
	useMyGroups,
} from "@src/hooks/use-groups";
import {
	firstActiveIdentity,
	useOwnedIdentities,
} from "@src/hooks/use-marketplace";
import { useAuthStore } from "@src/store/auth";
import { groupUnread } from "@src/store/group-conversations";

import { GroupAdminPanel } from "./GroupAdminPanel";

dayjs.extend(relativeTime);

export const Groups = ({ isDark }: { isDark: boolean }): FunctionComponent => {
	const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
	const [name, setName] = useState("Research Guild");
	const [description, setDescription] = useState("Encrypted agent workspace");
	const [isPublic, setIsPublic] = useState(false);
	const [messageInput, setMessageInput] = useState("");
	const agentId = useAuthStore((state) => state.agentId);
	const ownedIdentities = useOwnedIdentities(agentId);
	const groupIdentity = firstActiveIdentity(ownedIdentities.data?.identities);
	const actor = groupIdentity?.username ?? agentId ?? "";

	const myGroupsQuery = useMyGroups(actor);
	const discoverQuery = useGroups();
	const createGroup = useCreateGroup();
	const joinGroup = useJoinGroup();

	const groupMessages = useGroupMessages(actor);
	const memberQuery = useGroupMembers(selectedGroupId ?? "");
	const activeMemberIds = (memberQuery.data?.members ?? [])
		.filter((member: GroupMember): boolean => member.status === "active")
		.map((member: GroupMember): string => member.agentId);

	const myGroups: Array<GroupMetadata> = useMemo(
		(): Array<GroupMetadata> => myGroupsQuery.data?.groups ?? [],
		[myGroupsQuery.data]
	);
	const discoverGroups: Array<GroupMetadata> = useMemo(
		(): Array<GroupMetadata> => discoverQuery.data?.groups ?? [],
		[discoverQuery.data]
	);

	// A private group the agent created/joined won't appear in Discover, so
	// search both lists when resolving the open group.
	const activeGroup = useMemo((): GroupMetadata | undefined => {
		const all = [...myGroups, ...discoverGroups];
		return all.find((group): boolean => group.groupId === selectedGroupId);
	}, [myGroups, discoverGroups, selectedGroupId]);

	const myMember = (memberQuery.data?.members ?? []).find(
		(member): boolean => member.agentId === actor
	);
	const isMember = Boolean(myMember && myMember.status === "active");
	const isOwner =
		activeGroup?.createdBy === actor || myMember?.role === "owner";
	const isAdmin = isOwner || myMember?.role === "admin";

	const mutationError = createGroup.error ?? joinGroup.error;

	// Viewing a group clears its unread marker.
	const markGroupRead = groupMessages.markGroupRead;
	useEffect((): void => {
		if (selectedGroupId) {
			markGroupRead(selectedGroupId);
		}
	}, [selectedGroupId, groupMessages.threads, markGroupRead]);

	const handleSendMessage = (event: FormEvent): void => {
		event.preventDefault();
		const text = messageInput.trim();
		if (!activeGroup || !text || !actor || groupMessages.isSending) {
			return;
		}
		void groupMessages
			.send({
				groupId: activeGroup.groupId,
				epoch: activeGroup.membershipEpoch,
				members: activeMemberIds,
				text,
			})
			.then((): void => {
				setMessageInput("");
			})
			.catch((): void => {
				/* keep the draft; the hook surfaces the failure */
			});
	};

	const handleCreate = (event: FormEvent): void => {
		event.preventDefault();
		if (!actor || !name.trim()) {
			return;
		}
		createGroup.mutate(
			{
				name,
				description,
				createdBy: actor,
				// Groups are private (invite-only) unless explicitly made public.
				membershipPolicy: isPublic ? "open" : "invite-only",
				membersPublic: true,
				tags: ["explore"],
			},
			{
				onSuccess: (group): void => {
					setSelectedGroupId(group.groupId);
				},
			}
		);
	};

	const formClass = isDark
		? "border-neutral-800 bg-neutral-950"
		: "border-neutral-200 bg-neutral-50";
	const inputClass = isDark
		? "border-neutral-800 bg-neutral-900 text-white placeholder:text-neutral-600"
		: "border-neutral-200 bg-white text-black placeholder:text-neutral-400";
	const mutedClass = isDark ? "text-neutral-500" : "text-neutral-400";

	const renderGroupThread = (group: GroupMetadata): React.ReactElement => {
		const thread = groupMessages.threads[group.groupId] ?? [];
		const placeholder = groupMessages.isReady
			? "Message the group…"
			: "Enable encryption in the DMs tab to send";
		const canSend =
			groupMessages.isReady &&
			!groupMessages.isSending &&
			messageInput.trim().length > 0;
		return (
			<div
				className={`mt-4 flex flex-col rounded-lg border ${isDark ? "border-neutral-800" : "border-neutral-200"}`}
			>
				<div className="flex max-h-64 flex-1 flex-col gap-2 overflow-y-auto p-3">
					{thread.length === 0 ? (
						<p className={`text-xs ${mutedClass}`}>
							No messages yet — say hello to the group
						</p>
					) : null}
					{thread.map(
						(entry): React.ReactElement => (
							<div
								key={entry.id}
								className={`max-w-[75%] rounded-lg px-2.5 py-1.5 text-xs ${
									entry.outgoing
										? "self-end bg-blue-600 text-white"
										: isDark
											? "self-start bg-neutral-800 text-white"
											: "self-start bg-neutral-100 text-black"
								}`}
							>
								{!entry.outgoing ? (
									<span
										className={`mb-0.5 block text-[10px] font-medium ${isDark ? "text-neutral-400" : "text-neutral-500"}`}
									>
										{entry.from}
									</span>
								) : null}
								{entry.text}
							</div>
						)
					)}
				</div>
				<form
					className={`flex gap-2 border-t p-2 ${isDark ? "border-neutral-800" : "border-neutral-200"}`}
					onSubmit={handleSendMessage}
				>
					<input
						className={`flex-1 rounded-md border px-2 py-1 text-xs ${inputClass} disabled:opacity-50`}
						disabled={!groupMessages.isReady || groupMessages.isSending}
						placeholder={placeholder}
						value={messageInput}
						onChange={(event): void => {
							setMessageInput(event.target.value);
						}}
					/>
					<button
						className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
						disabled={!canSend}
						type="submit"
					>
						{groupMessages.isSending ? "Sending…" : "Send"}
					</button>
				</form>
			</div>
		);
	};

	const renderGroupDetail = (group: GroupMetadata): React.ReactElement => {
		const visibility = group.membershipPolicy === "open" ? "Public" : "Private";
		const canJoin = !isMember && group.membershipPolicy !== "invite-only";
		return (
			<div className="space-y-2">
				<p className={`text-xs ${mutedClass}`}>{group.description ?? ""}</p>
				<div className="flex flex-wrap items-center gap-2">
					<span
						className={`rounded-full px-2 py-0.5 text-[10px] ${
							visibility === "Public"
								? "bg-green-500/10 text-green-500"
								: "bg-amber-500/10 text-amber-500"
						}`}
					>
						{visibility}
					</span>
					<span className={`text-[10px] ${mutedClass}`}>
						{group.memberCount} members
					</span>
					{isMember ? (
						<span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] text-blue-500">
							{myMember?.role ?? "member"}
						</span>
					) : null}
				</div>
				{group.tags && group.tags.length > 0 ? (
					<div className="flex flex-wrap gap-1">
						{group.tags.map(
							(tag): React.ReactElement => (
								<span
									key={tag}
									className={`rounded-full px-2 py-0.5 text-[10px] ${isDark ? "bg-neutral-800 text-neutral-400" : "bg-neutral-200 text-neutral-600"}`}
								>
									{tag}
								</span>
							)
						)}
					</div>
				) : null}

				{canJoin ? (
					<button
						className="mt-2 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
						disabled={!actor || joinGroup.isPending}
						type="button"
						onClick={(): void => {
							joinGroup.mutate({ agentId: actor, groupId: group.groupId });
						}}
					>
						{joinGroup.isPending ? "Joining..." : "Join"}
					</button>
				) : null}
				{!isMember && group.membershipPolicy === "invite-only" ? (
					<p className={`text-[10px] ${mutedClass}`}>
						This group is invite-only — ask an admin for an invite link.
					</p>
				) : null}

				{isAdmin && actor ? (
					<GroupAdminPanel
						actor={actor}
						group={group}
						isDark={isDark}
						isOwner={isOwner}
					/>
				) : null}

				{isMember ? renderGroupThread(group) : null}
			</div>
		);
	};

	const renderGroupCard = (
		group: GroupMetadata,
		mine: boolean
	): React.ReactElement => (
		<button
			key={group.groupId}
			className={`rounded-lg border p-3 text-left ${isDark ? "border-neutral-800 hover:border-neutral-700" : "border-neutral-200 hover:border-neutral-300"}`}
			type="button"
			onClick={(): void => {
				setSelectedGroupId(group.groupId);
			}}
		>
			<div className="flex items-center justify-between gap-2">
				<span
					className={`flex min-w-0 items-center gap-1.5 text-xs font-medium ${isDark ? "text-white" : "text-black"}`}
				>
					{mine &&
					groupUnread(groupMessages.threads, group.groupId) > 0 &&
					selectedGroupId !== group.groupId ? (
						<span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
					) : null}
					<span className="truncate">{group.name}</span>
				</span>
				<span
					className={`shrink-0 rounded-full px-1.5 py-0.5 text-[8px] ${
						group.membershipPolicy === "open"
							? "bg-green-500/10 text-green-500"
							: "bg-amber-500/10 text-amber-500"
					}`}
				>
					{group.membershipPolicy === "open" ? "Public" : "Private"}
				</span>
			</div>
			<p className={`mt-1 text-[10px] ${mutedClass}`}>{group.description ?? ""}</p>
			<div className="mt-2 flex items-center justify-between">
				<span className={`text-[10px] ${mutedClass}`}>
					{group.memberCount} members
				</span>
				<span className={`text-[10px] ${mutedClass}`}>
					{dayjs(group.createdAt).fromNow()}
				</span>
			</div>
		</button>
	);

	const renderSection = (
		title: string,
		groups: Array<GroupMetadata>,
		mine: boolean,
		emptyLabel: string
	): React.ReactElement => (
		<div className="space-y-2">
			<span className={`text-[11px] font-medium uppercase ${mutedClass}`}>
				{title}
			</span>
			{groups.length === 0 ? (
				<p className={`text-xs ${mutedClass}`}>{emptyLabel}</p>
			) : (
				<div className="grid grid-cols-2 gap-2">
					{groups.map((group): React.ReactElement =>
						renderGroupCard(group, mine)
					)}
				</div>
			)}
		</div>
	);

	const renderContent = (): React.ReactElement => {
		if (activeGroup) {
			return renderGroupDetail(activeGroup);
		}
		if (myGroupsQuery.isLoading && discoverQuery.isLoading) {
			return (
				<div className="flex flex-1 items-center justify-center p-6">
					<span className={`text-xs ${mutedClass}`}>Loading groups...</span>
				</div>
			);
		}
		// Discover only lists public groups the agent hasn't joined yet.
		const joinedIds = new Set(myGroups.map((group): string => group.groupId));
		const discoverable = discoverGroups.filter(
			(group): boolean => !joinedIds.has(group.groupId)
		);
		return (
			<div className="space-y-4">
				{actor
					? renderSection(
							"My Groups",
							myGroups,
							true,
							"You haven't joined any groups yet."
						)
					: null}
				{renderSection(
					"Discover",
					discoverable,
					false,
					"No public groups to discover."
				)}
			</div>
		);
	};

	return (
		<div
			className={`flex h-full flex-col overflow-hidden rounded-lg border ${isDark ? "border-neutral-800 bg-neutral-950" : "border-neutral-200 bg-neutral-50"}`}
		>
			<form className={`border-b p-3 ${formClass}`} onSubmit={handleCreate}>
				<div className="grid gap-2 md:grid-cols-[1fr_auto]">
					<input
						className={`rounded-md border px-2 py-1 text-xs ${inputClass}`}
						placeholder="Group name"
						type="text"
						value={name}
						onChange={(event): void => {
							setName(event.target.value);
						}}
					/>
					<button
						className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
						disabled={createGroup.isPending || !actor || !name.trim()}
						type="submit"
					>
						{createGroup.isPending ? "Creating..." : "Create Group"}
					</button>
				</div>
				<input
					className={`mt-2 w-full rounded-md border px-2 py-1 text-xs ${inputClass}`}
					placeholder="Description"
					type="text"
					value={description}
					onChange={(event): void => {
						setDescription(event.target.value);
					}}
				/>
				<label
					className={`mt-2 flex items-center gap-2 text-[11px] ${mutedClass}`}
				>
					<input
						checked={isPublic}
						type="checkbox"
						onChange={(event): void => {
							setIsPublic(event.target.checked);
						}}
					/>
					Public — discoverable by anyone (otherwise invite-only)
				</label>
				{mutationError ? (
					<p className="mt-2 text-xs text-red-500">{mutationError.message}</p>
				) : null}
				<p
					className={`mt-2 text-xs ${actor ? mutedClass : "text-red-500"}`}
				>
					{actor
						? `Acting as ${actor}`
						: "Connect your wallet to create or join groups."}
				</p>
			</form>
			<div
				className={`flex items-center justify-between border-b px-4 py-3 ${isDark ? "border-neutral-800" : "border-neutral-200"}`}
			>
				<span
					className={`text-sm font-medium ${isDark ? "text-white" : "text-black"}`}
				>
					{activeGroup ? activeGroup.name : "Groups"}
				</span>
				{activeGroup ? (
					<button
						className={`text-[10px] ${isDark ? "text-neutral-500 hover:text-neutral-300" : "text-neutral-400 hover:text-neutral-600"}`}
						type="button"
						onClick={(): void => {
							setSelectedGroupId(null);
						}}
					>
						Back
					</button>
				) : null}
			</div>

			<div className="flex-1 overflow-y-auto p-3">{renderContent()}</div>
		</div>
	);
};
