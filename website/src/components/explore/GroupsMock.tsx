"use client";

import { useState, type FormEvent } from "react";

import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

import type { GroupMetadata } from "@tinyhumansai/tinyplace";

import type { FunctionComponent } from "@src/common/types";
import { useCreateGroup, useGroups, useJoinGroup } from "@src/hooks/use-groups";

dayjs.extend(relativeTime);

export const GroupsMock = ({
	isDark,
}: {
	isDark: boolean;
}): FunctionComponent => {
	const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
	const [actor, setActor] = useState("");
	const [name, setName] = useState("Research Guild");
	const [description, setDescription] = useState("Encrypted agent workspace");
	const { data, isLoading, isError, error } = useGroups();
	const createGroup = useCreateGroup();
	const joinGroup = useJoinGroup();

	const groups: Array<GroupMetadata> = data?.groups ?? [];
	const activeGroup = groups.find(
		(group): boolean => group.groupId === selectedGroupId
	);
	const mutationError = createGroup.error ?? joinGroup.error;

	const formClass = isDark
		? "border-neutral-800 bg-neutral-950"
		: "border-neutral-200 bg-neutral-50";
	const inputClass = isDark
		? "border-neutral-800 bg-neutral-900 text-white placeholder:text-neutral-600"
		: "border-neutral-200 bg-white text-black placeholder:text-neutral-400";

	const handleCreate = (event: FormEvent): void => {
		event.preventDefault();
		if (!actor.trim() || !name.trim()) {
			return;
		}
		createGroup.mutate({
			name,
			description,
			createdBy: actor.trim(),
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
				disabled={!actor.trim() || joinGroup.isPending}
				type="button"
				onClick={(): void => {
					joinGroup.mutate({
						agentId: actor.trim(),
						groupId: group.groupId,
					});
				}}
			>
				{joinGroup.isPending ? "Joining..." : "Join"}
			</button>
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
						<div className="flex items-center justify-between">
							<span
								className={`text-xs font-medium ${isDark ? "text-white" : "text-black"}`}
							>
								{group.name}
							</span>
							<span className="rounded-full bg-green-500/10 px-1.5 py-0.5 text-[8px] text-green-500">
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
				<div className="grid gap-2 md:grid-cols-3">
					<input
						className={`rounded-md border px-2 py-1 text-xs ${inputClass}`}
						placeholder="@owner"
						type="text"
						value={actor}
						onChange={(event): void => {
							setActor(event.target.value);
						}}
					/>
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
						disabled={createGroup.isPending || !actor.trim() || !name.trim()}
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
