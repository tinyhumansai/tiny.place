"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { Artifact } from "@tinyhumansai/tinyplace";

import type { FunctionComponent } from "@src/common/types";
import { ProfileEntityLink } from "@src/components/profile/EntityLink";
import { useArtifacts, useCreateArtifact } from "@src/hooks/use-artifacts";
import { useAuthStore } from "@src/store/auth";

function formatBytes(value: number | undefined): string {
	if (value == null || Number.isNaN(value)) {
		return "0 B";
	}
	if (value >= 1_000_000) {
		return `${(value / 1_000_000).toFixed(1)} MB`;
	}
	if (value >= 1_000) {
		return `${(value / 1_000).toFixed(1)} KB`;
	}
	return `${value} B`;
}

function formatDate(value: string | undefined, fallback: string): string {
	if (!value) {
		return fallback;
	}
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return fallback;
	}
	return date.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

function fakeSha256(seed: string): string {
	const base = Array.from(seed || "artifact", (character) =>
		character.charCodeAt(0).toString(16).padStart(2, "0")
	).join("");
	return (base + "a".repeat(64)).slice(0, 64);
}

function ArtifactRow({
	artifact,
	isDark,
}: {
	artifact: Artifact;
	isDark: boolean;
}): React.ReactElement {
	const { t } = useTranslation();
	const secondaryClass = isDark ? "text-neutral-500" : "text-neutral-500";
	const name = artifact.name ?? artifact.artifactId;
	return (
		<div
			className={`rounded-lg border p-3 ${
				isDark
					? "border-neutral-800 bg-neutral-950"
					: "border-neutral-200 bg-neutral-50"
			}`}
		>
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<p
						className={`truncate text-sm font-medium ${isDark ? "text-white" : "text-black"}`}
					>
						{name}
					</p>
					<p className={`mt-1 text-xs ${secondaryClass}`}>
						{artifact.mimeType ?? "application/octet-stream"} -{" "}
						{formatBytes(artifact.sizeBytes)}
					</p>
				</div>
				<span
					className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-medium ${
						artifact.status === "active"
							? "bg-emerald-500/10 text-emerald-500"
							: isDark
								? "bg-neutral-900 text-neutral-400"
								: "bg-neutral-200 text-neutral-600"
					}`}
				>
					{artifact.status ?? "unknown"}
				</span>
			</div>
			<div
				className={`mt-3 grid grid-cols-3 gap-2 text-[10px] ${secondaryClass}`}
			>
				<div>
					<p>{t("artifacts.owner")}</p>
					<p className={isDark ? "text-neutral-300" : "text-neutral-700"}>
						<ProfileEntityLink
							className="hover:underline"
							value={artifact.owner}
						>
							{artifact.owner}
						</ProfileEntityLink>
					</p>
				</div>
				<div>
					<p>{t("artifacts.recipients")}</p>
					<p className={isDark ? "text-neutral-300" : "text-neutral-700"}>
						{artifact.recipients?.length ?? 0}
					</p>
				</div>
				<div>
					<p>{t("artifacts.expires")}</p>
					<p className={isDark ? "text-neutral-300" : "text-neutral-700"}>
						{formatDate(artifact.expiresAt, t("artifacts.noExpiry"))}
					</p>
				</div>
			</div>
		</div>
	);
}

export const Artifacts = ({
	isDark,
}: {
	isDark: boolean;
}): FunctionComponent => {
	const { t } = useTranslation();
	const agentId = useAuthStore((state) => state.agentId);
	const artifactsQuery = useArtifacts({ status: "all", limit: 20 });
	const createArtifact = useCreateArtifact();
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [recipientInput, setRecipientInput] = useState("");

	const recipients = useMemo(
		(): Array<string> =>
			recipientInput
				.split(",")
				.map((recipient) => recipient.trim())
				.filter(Boolean),
		[recipientInput]
	);

	const handleSubmit = (event: React.FormEvent): void => {
		event.preventDefault();
		if (!name.trim()) {
			return;
		}
		createArtifact.mutate(
			{
				name,
				description,
				mimeType: "application/json",
				sizeBytes: Math.max(1, description.length || name.length),
				sha256: fakeSha256(`${name}:${description}`),
				encryption: "none",
				recipients,
				metadata: {
					source: "website",
					kind: "metadata-only",
				},
			},
			{
				onSuccess: (): void => {
					setName("");
					setDescription("");
					setRecipientInput("");
				},
			}
		);
	};

	const inputClass = `w-full rounded-md border px-2.5 py-1.5 text-xs ${
		isDark
			? "border-neutral-700 bg-neutral-900 text-white placeholder-neutral-600"
			: "border-neutral-300 bg-white text-black placeholder-neutral-400"
	}`;
	const labelClass = `text-xs font-medium ${isDark ? "text-neutral-400" : "text-neutral-500"}`;
	const artifacts = artifactsQuery.data?.artifacts ?? [];

	if (!agentId) {
		return (
			<div
				className={`rounded-lg border p-6 text-center ${
					isDark
						? "border-neutral-800 bg-neutral-950"
						: "border-neutral-200 bg-neutral-50"
				}`}
			>
				<p
					className={`text-sm ${isDark ? "text-neutral-400" : "text-neutral-500"}`}
				>
					{t("artifacts.connectWallet")}
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<form
				className={`rounded-lg border p-4 ${
					isDark
						? "border-neutral-800 bg-neutral-950"
						: "border-neutral-200 bg-neutral-50"
				}`}
				onSubmit={handleSubmit}
			>
				<h3
					className={`mb-3 text-sm font-medium ${isDark ? "text-white" : "text-black"}`}
				>
					{t("artifacts.createTitle")}
				</h3>
				<div className="grid grid-cols-2 gap-3">
					<div>
						<label className={labelClass}>{t("artifacts.name")}</label>
						<input
							required
							className={inputClass}
							placeholder={t("artifacts.namePlaceholder")}
							type="text"
							value={name}
							onChange={(event): void => {
								setName(event.target.value);
							}}
						/>
					</div>
					<div>
						<label className={labelClass}>{t("artifacts.recipients")}</label>
						<input
							className={inputClass}
							placeholder={t("artifacts.recipientsPlaceholder")}
							type="text"
							value={recipientInput}
							onChange={(event): void => {
								setRecipientInput(event.target.value);
							}}
						/>
					</div>
					<div className="col-span-2">
						<label className={labelClass}>{t("artifacts.description")}</label>
						<textarea
							className={`${inputClass} min-h-[64px] resize-none`}
							placeholder={t("artifacts.descriptionPlaceholder")}
							rows={3}
							value={description}
							onChange={(event): void => {
								setDescription(event.target.value);
							}}
						/>
					</div>
				</div>
				<div className="mt-3 flex items-center justify-between">
					<p
						className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-500"}`}
					>
						{t("artifacts.metadataHint")}
					</p>
					<button
						className="rounded-md bg-blue-500 px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
						disabled={createArtifact.isPending || !name.trim()}
						type="submit"
					>
						{createArtifact.isPending
							? t("common.creating")
							: t("common.create")}
					</button>
				</div>
				{createArtifact.isError && (
					<p className="mt-2 text-xs text-red-500">
						{createArtifact.error.message}
					</p>
				)}
			</form>

			<div className="space-y-2">
				<div className="flex items-center justify-between">
					<h3
						className={`text-sm font-medium ${isDark ? "text-white" : "text-black"}`}
					>
						{t("artifacts.title")}
					</h3>
					<span
						className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-500"}`}
					>
						{t("artifacts.recordCount", { count: artifacts.length })}
					</span>
				</div>
				{artifactsQuery.isLoading && (
					<p
						className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-500"}`}
					>
						{t("artifacts.loading")}
					</p>
				)}
				{artifactsQuery.isError && (
					<p className="text-xs text-red-500">{t("artifacts.loadError")}</p>
				)}
				{!artifactsQuery.isLoading && artifacts.length === 0 && (
					<p
						className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-500"}`}
					>
						{t("artifacts.empty")}
					</p>
				)}
				{artifacts.map((artifact) => (
					<ArtifactRow
						key={artifact.artifactId}
						artifact={artifact}
						isDark={isDark}
					/>
				))}
			</div>
		</div>
	);
};
