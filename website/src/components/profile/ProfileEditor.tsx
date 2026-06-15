"use client";

import { useState, type ReactElement } from "react";
import type { AgentProfile, UserProfileUpdate } from "@tinyhumansai/tinyplace";

import { useUpdateUserProfile } from "@src/hooks/use-users";

type ProfileEditorProperties = {
	profile: AgentProfile;
	onClose: () => void;
	/** Render in dark mode. Defaults to light. */
	isDark?: boolean;
};

/**
 * Inline editor for the signed-in wallet's User profile. Writes through the
 * SDK's `users.updateProfile`, which signs the canonical `user.profile`
 * payload. The profile fields belong to the wallet, not any single @handle.
 */
export function ProfileEditor({
	profile,
	onClose,
	isDark = false,
}: ProfileEditorProperties): ReactElement {
	const [displayName, setDisplayName] = useState(profile.displayName ?? "");
	const [bio, setBio] = useState(profile.bio ?? "");
	const [avatarEmail, setAvatarEmail] = useState(profile.avatarEmail ?? "");
	const [link, setLink] = useState(profile.link ?? "");
	const mutation = useUpdateUserProfile();

	const onSubmit = (event: React.FormEvent): void => {
		event.preventDefault();
		const update: UserProfileUpdate = {
			displayName: displayName.trim(),
			bio: bio.trim(),
			avatarEmail: avatarEmail.trim(),
			link: link.trim(),
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

	const surface = isDark
		? "border-neutral-800 bg-neutral-950"
		: "border-neutral-200 bg-white";
	const fieldClass = `w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none ${
		isDark
			? "border-neutral-800 bg-neutral-900 text-neutral-100"
			: "border-neutral-200 bg-white text-neutral-900"
	}`;
	const labelClass = `text-xs font-medium ${
		isDark ? "text-neutral-400" : "text-neutral-500"
	}`;
	const headingClass = `text-sm font-medium ${
		isDark ? "text-neutral-100" : "text-neutral-900"
	}`;
	const cancelClass = `rounded-lg px-4 py-2 text-sm font-medium ${
		isDark ? "text-neutral-400" : "text-neutral-500"
	}`;

	return (
		<form
			className={`flex flex-col gap-4 rounded-lg border p-4 ${surface}`}
			onSubmit={onSubmit}
		>
			<h2 className={headingClass}>Edit profile</h2>
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
				<span className={labelClass}>Gravatar email</span>
				<input
					className={fieldClass}
					type="email"
					value={avatarEmail}
					onChange={(event): void => {
						setAvatarEmail(event.target.value);
					}}
				/>
				<span
					className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
				>
					Used only to resolve your Gravatar avatar.
				</span>
			</label>
			<label className="flex flex-col gap-1">
				<span className={labelClass}>Profile link</span>
				<input
					className={fieldClass}
					type="url"
					value={link}
					onChange={(event): void => {
						setLink(event.target.value);
					}}
				/>
				<span
					className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
				>
					Add one website, social profile, or docs URL.
				</span>
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
				<button className={cancelClass} type="button" onClick={onClose}>
					Cancel
				</button>
			</div>
		</form>
	);
}
