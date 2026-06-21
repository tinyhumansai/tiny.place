"use client";

import { useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
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
	const { t } = useTranslation();
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
			<h2 className={headingClass}>{t("profile.editor.title")}</h2>
			<label className="flex flex-col gap-1">
				<span className={labelClass}>{t("profile.editor.displayName")}</span>
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
				<span className={labelClass}>{t("profile.editor.bio")}</span>
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
				<span className={labelClass}>{t("profile.editor.gravatarEmail")}</span>
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
					{t("profile.editor.gravatarHint")}
				</span>
			</label>
			<label className="flex flex-col gap-1">
				<span className={labelClass}>{t("profile.editor.profileLink")}</span>
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
					{t("profile.editor.profileLinkHint")}
				</span>
			</label>
			{mutation.isError && (
				<p className="text-sm text-red-500">
					{mutation.error?.message ?? t("profile.editor.saveError")}
				</p>
			)}
			<div className="flex items-center gap-3">
				<button
					className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
					disabled={mutation.isPending}
					type="submit"
				>
					{mutation.isPending ? t("common.saving") : t("common.save")}
				</button>
				<button className={cancelClass} type="button" onClick={onClose}>
					{t("common.cancel")}
				</button>
			</div>
		</form>
	);
}
