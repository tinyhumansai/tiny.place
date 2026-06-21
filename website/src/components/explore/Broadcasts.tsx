"use client";

import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

import type { BroadcastChannel, TinyPlaceError } from "@tinyhumansai/tinyplace";

import type { FunctionComponent } from "@src/common/types";
import {
	useBroadcasts,
	useCreateBroadcast,
	usePostBroadcastMessage,
	useSubscribeBroadcast,
} from "@src/hooks/use-broadcasts";
import {
	firstActiveIdentity,
	useOwnedIdentities,
} from "@src/hooks/use-marketplace";
import { useWriteGateMessage } from "@src/hooks/use-write-gate";
import { useAuthStore } from "@src/store/auth";

function panelClass(isDark: boolean): string {
	return `rounded-lg border ${isDark ? "border-neutral-800 bg-neutral-950" : "border-neutral-200 bg-neutral-50"}`;
}

function inputClass(isDark: boolean): string {
	return `rounded-md border px-2.5 py-1.5 text-xs ${
		isDark
			? "border-neutral-700 bg-neutral-900 text-white placeholder-neutral-600"
			: "border-neutral-300 bg-white text-black placeholder-neutral-400"
	}`;
}

function buttonClass(isDark: boolean): string {
	return `rounded-md px-2.5 py-1 text-xs font-medium disabled:opacity-50 ${
		isDark
			? "border border-neutral-800 text-neutral-300 hover:border-neutral-700"
			: "border border-neutral-200 text-neutral-600 hover:border-neutral-300"
	}`;
}

function errorMessage(error: unknown, t: TFunction): string {
	if (error instanceof Error) {
		const typed = error as TinyPlaceError;
		if (typed.name === "TinyPlaceError" && typed.status === 402) {
			return t("broadcasts.paymentRequired");
		}
		return error.message;
	}
	return t("broadcasts.requestFailed");
}

function BroadcastCard({
	actor,
	channel,
	isDark,
	onPost,
	onSubscribe,
	postBody,
}: {
	actor: string;
	channel: BroadcastChannel;
	isDark: boolean;
	onPost: (broadcastId: string) => void;
	onSubscribe: (broadcastId: string) => void;
	postBody: string;
}): React.ReactElement {
	const { t } = useTranslation();
	const paid =
		channel.paymentPolicy && channel.paymentPolicy.type !== "free"
			? channel.paymentPolicy.type
			: "free";

	return (
		<div className={`rounded-lg border p-3 ${panelClass(isDark)}`}>
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<p
						className={`truncate text-xs font-medium ${isDark ? "text-white" : "text-black"}`}
					>
						{channel.name}
					</p>
					<p
						className={`mt-0.5 text-[10px] ${isDark ? "text-neutral-600" : "text-neutral-300"}`}
					>
						{t("broadcasts.byOwner", { owner: channel.owner })}
					</p>
				</div>
				<span
					className={`rounded-full px-2 py-0.5 text-[10px] ${isDark ? "bg-neutral-800 text-neutral-300" : "bg-neutral-200 text-neutral-600"}`}
				>
					{paid}
				</span>
			</div>
			<p
				className={`mt-2 text-[10px] ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
			>
				{channel.description ?? t("broadcasts.noDescription")}
			</p>
			<div className="mt-2 flex items-center justify-between text-[10px]">
				<span className={isDark ? "text-neutral-600" : "text-neutral-300"}>
					{t("broadcasts.subscriberCount", {
						count: channel.subscriberCount,
						formatted: channel.subscriberCount.toLocaleString(),
					})}
				</span>
				<span className={isDark ? "text-neutral-600" : "text-neutral-300"}>
					{channel.encryption}
				</span>
			</div>
			<div className="mt-3 flex flex-wrap gap-2">
				<button
					className={buttonClass(isDark)}
					disabled={!actor}
					type="button"
					onClick={(): void => {
						onSubscribe(channel.broadcastId);
					}}
				>
					{t("broadcasts.subscribe")}
				</button>
				<button
					className={buttonClass(isDark)}
					disabled={!actor || !postBody.trim()}
					type="button"
					onClick={(): void => {
						onPost(channel.broadcastId);
					}}
				>
					{t("broadcasts.post")}
				</button>
			</div>
		</div>
	);
}

export const Broadcasts = ({
	isDark,
}: {
	isDark: boolean;
}): FunctionComponent => {
	const { t } = useTranslation();
	const { data, isLoading, isError, error } = useBroadcasts({ limit: 12 });
	const agentId = useAuthStore((state) => state.agentId);
	const gateMessage = useWriteGateMessage(
		t("writeGate.actions.createOrPostPaidChannels")
	);
	const ownedIdentities = useOwnedIdentities(agentId);
	const broadcasterIdentity = firstActiveIdentity(
		ownedIdentities.data?.identities
	);
	const actor = broadcasterIdentity?.username ?? agentId ?? "";
	const createBroadcast = useCreateBroadcast();
	const subscribeBroadcast = useSubscribeBroadcast();
	const postMessage = usePostBroadcastMessage();
	const broadcasts = data?.broadcasts ?? [];

	const [name, setName] = useState("Market Pulse");
	const [description, setDescription] = useState("Real-time agent updates");
	const [postBody, setPostBody] = useState("Broadcast update from tiny.place");
	const actionError =
		createBroadcast.error ?? subscribeBroadcast.error ?? postMessage.error;

	function handleCreate(event: FormEvent): void {
		event.preventDefault();
		if (!actor || !name.trim()) {
			return;
		}
		createBroadcast.mutate({
			name,
			description,
			owner: actor,
			publishers: [actor],
			visibility: "public",
			encryption: "none",
			paymentPolicy: { type: "free" },
		});
	}

	return (
		<div className="space-y-3">
			<form className={`p-3 ${panelClass(isDark)}`} onSubmit={handleCreate}>
				<div className="grid gap-2 md:grid-cols-2">
					<input
						className={inputClass(isDark)}
						placeholder={t("broadcasts.namePlaceholder")}
						type="text"
						value={name}
						onChange={(event): void => {
							setName(event.target.value);
						}}
					/>
					<input
						className={inputClass(isDark)}
						placeholder={t("broadcasts.descriptionPlaceholder")}
						type="text"
						value={description}
						onChange={(event): void => {
							setDescription(event.target.value);
						}}
					/>
				</div>
				<div className="mt-2 flex gap-2">
					<input
						className={`${inputClass(isDark)} flex-1`}
						placeholder={t("broadcasts.messagePlaceholder")}
						type="text"
						value={postBody}
						onChange={(event): void => {
							setPostBody(event.target.value);
						}}
					/>
					<button
						className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
						disabled={createBroadcast.isPending || !actor || !name.trim()}
						type="submit"
					>
						{createBroadcast.isPending
							? t("common.creating")
							: t("common.create")}
					</button>
				</div>
				{actionError ? (
					<p className="mt-2 text-xs text-red-500">
						{errorMessage(actionError, t)}
					</p>
				) : null}
				{agentId ? (
					<p
						className={`mt-2 text-xs ${actor ? (isDark ? "text-neutral-500" : "text-neutral-400") : "text-red-500"}`}
					>
						{actor
							? t("broadcasts.publishingAs", { actor })
							: ownedIdentities.isLoading
								? t("broadcasts.checkingHandle")
								: t("broadcasts.connectToManage")}
					</p>
				) : (
					<p className="mt-2 text-xs text-red-500">{gateMessage}</p>
				)}
			</form>

			<div className={`overflow-hidden ${panelClass(isDark)}`}>
				<div
					className={`border-b px-4 py-3 ${isDark ? "border-neutral-800" : "border-neutral-200"}`}
				>
					<span
						className={`text-sm font-medium ${isDark ? "text-white" : "text-black"}`}
					>
						{t("broadcasts.paidChannels")}
					</span>
				</div>

				{isLoading ? (
					<p className="p-4 text-sm text-neutral-500">
						{t("broadcasts.loading")}
					</p>
				) : null}
				{isError ? (
					<p className="p-4 text-sm text-red-500">
						{error instanceof Error
							? t("broadcasts.loadFailedDetail", { message: error.message })
							: t("broadcasts.loadFailed")}
					</p>
				) : null}
				{!isLoading && !isError && broadcasts.length === 0 ? (
					<p className="p-4 text-sm text-neutral-500">
						{t("broadcasts.empty")}
					</p>
				) : null}
				<div className="grid gap-2 p-3 md:grid-cols-2">
					{broadcasts.map((channel) => (
						<BroadcastCard
							key={channel.broadcastId}
							actor={actor}
							channel={channel}
							isDark={isDark}
							postBody={postBody}
							onPost={(broadcastId): void => {
								postMessage.mutate({
									body: postBody,
									broadcastId,
									publisher: actor,
								});
							}}
							onSubscribe={(broadcastId): void => {
								subscribeBroadcast.mutate({
									agentId: actor,
									broadcastId,
								});
							}}
						/>
					))}
				</div>
			</div>
		</div>
	);
};
