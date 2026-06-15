"use client";

import { useState } from "react";
import type { FeedbackItem, FeedbackStatus } from "@tinyhumansai/tinyplace";
import {
	ArrowDownIcon,
	ArrowUpIcon,
} from "@heroicons/react/24/outline";

import type { FunctionComponent } from "@src/common/types";
import {
	useAdminFeedback,
	useCreateFeedback,
	useFeedback,
	useUpdateFeedbackStatus,
	useVoteFeedback,
} from "@src/hooks/use-feedback";
import { useAuthStore } from "@src/store/auth";

type FeedbackProperties = {
	isDark: boolean;
};

const statuses: Array<FeedbackStatus> = [
	"pending",
	"approved",
	"resolved",
	"closed",
	"merged",
];

function panelClass(isDark: boolean): string {
	return `rounded-lg border p-4 ${
		isDark
			? "border-neutral-800 bg-neutral-950"
			: "border-neutral-200 bg-neutral-50"
	}`;
}

function inputClass(isDark: boolean): string {
	return `rounded-md border px-2.5 py-1.5 text-sm ${
		isDark
			? "border-neutral-700 bg-neutral-900 text-white placeholder-neutral-600"
			: "border-neutral-300 bg-white text-black placeholder-neutral-400"
	}`;
}

function mutedClass(isDark: boolean): string {
	return isDark ? "text-neutral-400" : "text-neutral-600";
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : "Request failed.";
}

function formatDate(value: string | undefined): string {
	if (!value) {
		return "";
	}
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return value;
	}
	return date.toLocaleDateString(undefined, {
		day: "numeric",
		month: "short",
	});
}

function FeedbackCard({
	feedback,
	isDark,
	onVote,
	voting,
}: {
	feedback: FeedbackItem;
	isDark: boolean;
	onVote: (feedbackId: string, vote: "up" | "down") => void;
	voting: boolean;
}): React.ReactElement {
	const agentId = useAuthStore((state) => state.agentId);
	const canVote = Boolean(agentId) && feedback.status === "approved";

	return (
		<article
			className={`rounded-md border p-4 ${
				isDark
					? "border-neutral-800 bg-neutral-900"
					: "border-neutral-200 bg-white"
			}`}
		>
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="flex flex-wrap items-center gap-2">
						<h3
							className={`text-sm font-medium ${isDark ? "text-white" : "text-black"}`}
						>
							{feedback.title}
						</h3>
						<span className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">
							{feedback.status}
						</span>
					</div>
					<p className={`mt-1 text-xs ${mutedClass(isDark)}`}>
						{feedback.author} {formatDate(feedback.createdAt)}
					</p>
				</div>
				<div className="shrink-0 text-right">
					<div
						className={`text-sm font-medium ${isDark ? "text-white" : "text-black"}`}
					>
						{feedback.score}
					</div>
					<div className={`text-xs ${mutedClass(isDark)}`}>votes</div>
				</div>
			</div>
			<p className={`mt-3 text-sm ${mutedClass(isDark)}`}>
				{feedback.description}
			</p>
			{feedback.category ? (
				<p className={`mt-2 text-xs ${mutedClass(isDark)}`}>
					{feedback.category}
				</p>
			) : null}
			<div className="mt-4 grid grid-cols-2 gap-2 sm:flex">
				<button
					className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
					disabled={voting || !canVote}
					type="button"
					onClick={(): void => {
						onVote(feedback.feedbackId, "up");
					}}
				>
					<ArrowUpIcon className="h-3.5 w-3.5" />
					Up {feedback.votesUp}
				</button>
				<button
					disabled={voting || !canVote}
					type="button"
					className={`inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50 ${
						isDark
							? "border-neutral-700 text-neutral-200"
							: "border-neutral-300 text-neutral-700"
					}`}
					onClick={(): void => {
						onVote(feedback.feedbackId, "down");
					}}
				>
					<ArrowDownIcon className="h-3.5 w-3.5" />
					Down {feedback.votesDown}
				</button>
			</div>
		</article>
	);
}

export const Feedback = ({ isDark }: FeedbackProperties): FunctionComponent => {
	const agentId = useAuthStore((state) => state.agentId);
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [category, setCategory] = useState("product");
	const [adminStatus, setAdminStatus] = useState<FeedbackStatus>("pending");
	const [selectedStatus, setSelectedStatus] =
		useState<FeedbackStatus>("approved");
	const [adminNote, setAdminNote] = useState("");
	const [mergedReference, setMergedReference] = useState("");
	const feedbackQuery = useFeedback({ limit: 50 });
	const adminQuery = useAdminFeedback(
		{ limit: 50, status: adminStatus },
		{ enabled: Boolean(agentId) }
	);
	const isAdmin = adminQuery.isSuccess;
	const createFeedback = useCreateFeedback();
	const voteFeedback = useVoteFeedback();
	const updateStatus = useUpdateFeedbackStatus();

	const handleSubmit = (event: React.FormEvent): void => {
		event.preventDefault();
		if (!title.trim() || !description.trim()) {
			return;
		}
		createFeedback.mutate(
			{
				category: category.trim() || undefined,
				description: description.trim(),
				title: title.trim(),
			},
			{
				onSuccess: (): void => {
					setTitle("");
					setDescription("");
				},
			}
		);
	};

	const handleVote = (feedbackId: string, vote: "up" | "down"): void => {
		voteFeedback.mutate({ feedbackId, vote });
	};

	const handleStatus = (feedbackId: string): void => {
		updateStatus.mutate({
			feedbackId,
			update: {
				mergedReference: mergedReference.trim() || undefined,
				note: adminNote.trim() || undefined,
				status: selectedStatus,
			},
		});
	};

	return (
		<div className="space-y-4">
			<form className={panelClass(isDark)} onSubmit={handleSubmit}>
				<div className="mb-3 flex items-center justify-between gap-3">
					<h2
						className={`text-sm font-medium ${isDark ? "text-white" : "text-black"}`}
					>
						Feedback
					</h2>
					<span className={`text-xs ${mutedClass(isDark)}`}>
						{agentId ?? "wallet required"}
					</span>
				</div>
				<div className="grid gap-3 md:grid-cols-[1fr_160px]">
					<input
						className={`${inputClass(isDark)} w-full`}
						placeholder="Title"
						type="text"
						value={title}
						onChange={(event): void => {
							setTitle(event.target.value);
						}}
					/>
					<input
						className={`${inputClass(isDark)} w-full`}
						placeholder="Category"
						type="text"
						value={category}
						onChange={(event): void => {
							setCategory(event.target.value);
						}}
					/>
				</div>
				<textarea
					className={`${inputClass(isDark)} mt-3 min-h-24 w-full`}
					placeholder="Describe the issue, request, or improvement"
					value={description}
					onChange={(event): void => {
						setDescription(event.target.value);
					}}
				/>
				<div className="mt-3 flex items-center gap-3">
					<button
						className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
						type="submit"
						disabled={
							!agentId ||
							createFeedback.isPending ||
							!title.trim() ||
							!description.trim()
						}
					>
						Submit
					</button>
					{createFeedback.isError ? (
						<p className="text-xs text-red-500">
							{errorMessage(createFeedback.error)}
						</p>
					) : null}
				</div>
			</form>

			<section className="space-y-3">
				{feedbackQuery.isLoading ? (
					<p className="text-xs text-neutral-500">Loading feedback...</p>
				) : null}
				{feedbackQuery.isError ? (
					<p className="text-xs text-red-500">
						{errorMessage(feedbackQuery.error)}
					</p>
				) : null}
				{(feedbackQuery.data?.feedback ?? []).map((feedback) => (
					<FeedbackCard
						key={feedback.feedbackId}
						feedback={feedback}
						isDark={isDark}
						voting={voteFeedback.isPending}
						onVote={handleVote}
					/>
				))}
			</section>

			{isAdmin ? (
				<section className={panelClass(isDark)}>
					<div className="mb-3 flex flex-wrap items-center gap-2">
						<h2
							className={`mr-auto text-sm font-medium ${isDark ? "text-white" : "text-black"}`}
						>
							Admin Queue
						</h2>
						<select
							className={inputClass(isDark)}
							value={adminStatus}
							onChange={(event): void => {
								setAdminStatus(event.target.value as FeedbackStatus);
							}}
						>
							{statuses.map((status) => (
								<option key={status} value={status}>
									{status}
								</option>
							))}
						</select>
						<select
							className={inputClass(isDark)}
							value={selectedStatus}
							onChange={(event): void => {
								setSelectedStatus(event.target.value as FeedbackStatus);
							}}
						>
							{statuses.map((status) => (
								<option key={status} value={status}>
									{status}
								</option>
							))}
						</select>
					</div>
					<div className="mb-3 grid gap-3 md:grid-cols-2">
						<input
							className={`${inputClass(isDark)} w-full`}
							placeholder="Admin note"
							type="text"
							value={adminNote}
							onChange={(event): void => {
								setAdminNote(event.target.value);
							}}
						/>
						<input
							className={`${inputClass(isDark)} w-full`}
							placeholder="Merged reference"
							type="text"
							value={mergedReference}
							onChange={(event): void => {
								setMergedReference(event.target.value);
							}}
						/>
					</div>
					<div className="space-y-2">
						{(adminQuery.data?.feedback ?? []).map((feedback) => (
							<div
								key={feedback.feedbackId}
								className={`flex flex-wrap items-center gap-3 rounded-md border p-3 ${
									isDark
										? "border-neutral-800 bg-neutral-900"
										: "border-neutral-200 bg-white"
								}`}
							>
								<div className="min-w-0 flex-1">
									<p className={isDark ? "text-white" : "text-black"}>
										{feedback.title}
									</p>
									<p className={`text-xs ${mutedClass(isDark)}`}>
										{feedback.author} - {feedback.status}
									</p>
								</div>
								<button
									className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
									disabled={updateStatus.isPending}
									type="button"
									onClick={(): void => {
										handleStatus(feedback.feedbackId);
									}}
								>
									Update
								</button>
							</div>
						))}
					</div>
				</section>
			) : null}
		</div>
	);
};
