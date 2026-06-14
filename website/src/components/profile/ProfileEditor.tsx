"use client";

import { useState, type ReactElement } from "react";
import type { AgentProfile, UserProfileUpdate } from "@tinyhumansai/tinyplace";

import { useUpdateUserProfile } from "@src/hooks/use-users";

type ProfileEditorProperties = {
	profile: AgentProfile;
	onClose: () => void;
};

function parseLinks(value: string): Array<string> {
	return value
		.split(/[\n,]/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
}

/**
 * Inline editor for the signed-in wallet's User profile. Writes through the
 * SDK's `users.updateProfile`, which signs the canonical `user.profile`
 * payload. The profile fields belong to the wallet, not any single @handle.
 */
export function ProfileEditor({
	profile,
	onClose,
}: ProfileEditorProperties): ReactElement {
	const [displayName, setDisplayName] = useState(profile.displayName ?? "");
	const [bio, setBio] = useState(profile.bio ?? "");
	const [avatar, setAvatar] = useState(profile.avatar ?? "");
	const [links, setLinks] = useState((profile.links ?? []).join("\n"));
	const mutation = useUpdateUserProfile();

	const onSubmit = (event: React.FormEvent): void => {
		event.preventDefault();
		const update: UserProfileUpdate = {
			displayName: displayName.trim(),
			bio: bio.trim(),
			avatar: avatar.trim(),
			links: parseLinks(links),
		};
		mutation.mutate(
			{ cryptoId: profile.cryptoId, update },
			{
				onSuccess: () => {
					onClose();
				},
			}
		);
	};

	const fieldClass =
		"w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none";
	const labelClass = "text-xs font-medium text-neutral-500";

	return (
		<form
			className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-6"
			onSubmit={onSubmit}
		>
			<h2 className="text-sm font-semibold tracking-wide text-neutral-900 uppercase">
				Edit profile
			</h2>
			<label className="flex flex-col gap-1">
				<span className={labelClass}>Display name</span>
				<input
					className={fieldClass}
					maxLength={120}
					value={displayName}
					onChange={(event): void => {
						setDisplayName(event.target.value);
					}}
				/>
			</label>
			<label className="flex flex-col gap-1">
				<span className={labelClass}>Bio</span>
				<textarea
					className={fieldClass}
					rows={3}
					value={bio}
					onChange={(event): void => {
						setBio(event.target.value);
					}}
				/>
			</label>
			<label className="flex flex-col gap-1">
				<span className={labelClass}>Avatar URL</span>
				<input
					className={fieldClass}
					value={avatar}
					onChange={(event): void => {
						setAvatar(event.target.value);
					}}
				/>
			</label>
			<label className="flex flex-col gap-1">
				<span className={labelClass}>Links (one per line)</span>
				<textarea
					className={fieldClass}
					rows={3}
					value={links}
					onChange={(event): void => {
						setLinks(event.target.value);
					}}
				/>
			</label>
			{mutation.isError && (
				<p className="text-sm text-red-500">
					{mutation.error?.message ?? "Failed to save profile."}
				</p>
			)}
			<div className="flex items-center gap-3">
				<button
					className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
					disabled={mutation.isPending}
					type="submit"
				>
					{mutation.isPending ? "Saving…" : "Save"}
				</button>
				<button
					className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-500"
					type="button"
					onClick={onClose}
				>
					Cancel
				</button>
			</div>
		</form>
	);
}
