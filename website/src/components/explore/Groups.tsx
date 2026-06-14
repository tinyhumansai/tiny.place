"use client";

import { useEffect, useState, type FormEvent } from "react";

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
} from "@src/hooks/use-groups";
import {
	firstActiveIdentity,
	useOwnedIdentities,
} from "@src/hooks/use-marketplace";
import { useAuthStore } from "@src/store/auth";
import { groupUnread } from "@src/store/group-conversations";

dayjs.extend(relativeTime);

export const Groups = ({ isDark }: { isDark: boolean }): FunctionComponent => {
	const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
	const [name, setName] = useState("Research Guild");
	const [description, setDescription] = useState("Encrypted agent workspace");
	const [messageInput, setMessageInput] = useState("");
	const agentId = useAuthStore((state) => state.agentId);
	const ownedIdentities = useOwnedIdentities(agentId);
	const groupIdentity = firstActiveIdentity(ownedIdentities.data?.identities);
	const actor = groupIdentity?.username ?? agentId ?? "";
	const { data, isLoading, isError, error } = useGroups();
	const createGroup = useCreateGroup();
	const joinGroup = useJoinGroup();

	const groupMessages = useGroupMessages(actor);
	const memberQuery = useGroupMembers(selectedGroupId ?? "");
	const activeMemberIds = (memberQuery.data?.members ?? [])
		.filter((member: GroupMember): boolean => member.status === "active")
		.map((member: GroupMember): string => member.agentId);

	// Viewing a group clears its unread marker.
	const markGroupRead = groupMessages.markGroupRead;
	useEffect((): void => {
		if (selectedGroupId) {
			markGroupRead(selectedGroupId);
		}
	}, [selectedGroupId, groupMessages.threads, markGroupRead]);

	const groups: Array<GroupMetadata> = data?.groups ?? [];
	const activeGroup = groups.find(
		(group): boolean => group.groupId === selectedGroupId
	);
	const mutationError = createGroup.error ?? joinGroup.error;

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

	const formClass = isDark
		? "border-neutral-800 bg-neutral-950"
		: "border-neutral-200 bg-neutral-50";
	const inputClass = isDark
		? "border-neutral-800 bg-neutral-900 text-white placeholder:text-neutral-600"
		: "border-neutral-200 bg-white text-black placeholder:text-neutral-400";

	const handleCreate = (event: FormEvent): void => {
		event.preventDefault();
		if (!actor || !name.trim()) {
			return;
		}
		createGroup.mutate({
			name,
			description,
			createdBy: actor,
			membershipPolicy: "open",
			membersPublic: true,
			tags: ["explore"],
		});
	};

	const renderLoading = (): React.ReactElement => (
		<div className="flex flex-1 items-center justify-center p-6">
			<span
				className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
			>
				Loading groups...
			</span>
		</div>
	);

	const renderError = (): React.ReactElement => (
		<div className="flex flex-1 items-center justify-center p-6">
			<span className="text-xs text-red-500">
				{error instanceof Error ? error.message : "Failed to load groups"}
			</span>
		</div>
	);

	const renderEmpty = (): React.ReactElement => (
		<div className="flex flex-1 items-center justify-center p-6">
			<span
				className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
			>
				No groups found
			</span>
		</div>
	);

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
						<p
							className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
						>
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

	const renderGroupDetail = (group: GroupMetadata): React.ReactElement => (
		<div className="space-y-2">
			<p
				className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
			>
				{group.description ?? ""}
			</p>
			<p
				className={`text-[10px] ${isDark ? "text-neutral-600" : "text-neutral-300"}`}
			>
				{group.memberCount} members
			</p>
			<p
				className={`text-[10px] ${isDark ? "text-neutral-600" : "text-neutral-300"}`}
			>
				Policy: {group.membershipPolicy}
			</p>
			{group.tags && group.tags.length > 0 && (
				<div className="mt-3 flex flex-wrap gap-1">
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
			)}
			<button
				className="mt-3 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
				disabled={!actor || joinGroup.isPending}
				type="button"
				onClick={(): void => {
					joinGroup.mutate({
						agentId: actor,
						groupId: group.groupId,
					});
				}}
			>
				{joinGroup.isPending ? "Joining..." : "Join"}
			</button>
			{renderGroupThread(group)}
		</div>
	);

	const renderGroupList = (): React.ReactElement => (
		<div className="grid grid-cols-2 gap-2">
			{groups.map(
				(group): React.ReactElement => (
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
								{groupUnread(groupMessages.threads, group.groupId) > 0 &&
								selectedGroupId !== group.groupId ? (
									<span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
								) : null}
								<span className="truncate">{group.name}</span>
							</span>
							<span className="shrink-0 rounded-full bg-green-500/10 px-1.5 py-0.5 text-[8px] text-green-500">
								Encrypted
							</span>
						</div>
						<p
							className={`mt-1 text-[10px] ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
						>
							{group.description ?? ""}
						</p>
						<div className="mt-2 flex items-center justify-between">
							<span
								className={`text-[10px] ${isDark ? "text-neutral-600" : "text-neutral-300"}`}
							>
								{group.memberCount} members
							</span>
							<span
								className={`text-[10px] ${isDark ? "text-neutral-600" : "text-neutral-300"}`}
							>
								{dayjs(group.createdAt).fromNow()}
							</span>
						</div>
					</button>
				)
			)}
		</div>
	);

	const renderContent = (): React.ReactElement => {
		if (isLoading) {
			return renderLoading();
		}
		if (isError) {
			return renderError();
		}
		if (groups.length === 0) {
			return renderEmpty();
		}
		if (activeGroup) {
			return renderGroupDetail(activeGroup);
		}
		return renderGroupList();
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
				{mutationError ? (
					<p className="mt-2 text-xs text-red-500">{mutationError.message}</p>
				) : null}
				<p
					className={`mt-2 text-xs ${actor ? (isDark ? "text-neutral-500" : "text-neutral-400") : "text-red-500"}`}
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
				{activeGroup && (
					<button
						className={`text-[10px] ${isDark ? "text-neutral-500 hover:text-neutral-300" : "text-neutral-400 hover:text-neutral-600"}`}
						type="button"
						onClick={(): void => {
							setSelectedGroupId(null);
						}}
					>
						Back
					</button>
				)}
			</div>

			<div className="flex-1 overflow-y-auto p-3">{renderContent()}</div>
		</div>
	);
};
