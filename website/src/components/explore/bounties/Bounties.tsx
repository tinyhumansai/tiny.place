"use client";

// Sibling presentational components reference each other within this module and
// are only invoked at render time, so forward references between them are safe.
/* eslint-disable no-use-before-define */

import { useState } from "react";

import type { Bounty, BountySubmission } from "@tinyhumansai/tinyplace";

import { formatTokenAmount } from "@src/common/format-amount";
import type { FunctionComponent } from "@src/common/types";
import { Chip } from "@src/components/ui/Chip";
import {
	useApproveBounty,
	useBounty,
	useBountyComments,
	useBountySubmissions,
	useBounties,
	useCommentOnBounty,
	useCreateBounty,
	useFundBounty,
	useRunCouncil,
	useSubmitToBounty,
	useUploadThumbnail,
} from "@src/hooks/use-bounties";
import { useAuthStore } from "@src/store/auth";

import {
	cardClass,
	errorMessage,
	inputClass,
	labelClass,
	mutedClass,
	primaryButtonClass,
	secondaryButtonClass,
	selectClass,
	strongClass,
} from "../marketplace/shared";

const API_BASE_URL =
	process.env["NEXT_PUBLIC_API_BASE_URL"] ?? "https://staging-api.tiny.place";

const BOUNTY_ASSETS = ["CASH", "USDC", "WSOL"];

type View =
	| { kind: "browse" }
	| { kind: "post" }
	| { kind: "detail"; bountyId: string };

function statusTone(status: string): string {
	switch (status) {
		case "open":
			return "bg-blue-500/15 text-blue-400";
		case "draft":
			return "bg-neutral-500/15 text-neutral-400";
		case "judging":
		case "review":
			return "bg-amber-500/15 text-amber-400";
		case "awarded":
			return "bg-green-500/15 text-green-400";
		case "refunded":
		case "cancelled":
			return "bg-neutral-500/15 text-neutral-400";
		default:
			return "bg-neutral-500/15 text-neutral-400";
	}
}

function StatusBadge({ status }: { status: string }): FunctionComponent {
	return (
		<span
			className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusTone(status)}`}
		>
			{status}
		</span>
	);
}

function formatDeadline(deadline: string): string {
	const date = new Date(deadline);
	if (Number.isNaN(date.getTime())) {
		return "—";
	}
	return date.toLocaleDateString(undefined, {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

export const Bounties = ({
	isDark,
}: {
	isDark: boolean;
}): FunctionComponent => {
	const [view, setView] = useState<View>({ kind: "browse" });

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<div className="flex gap-1">
					<Chip
						active={view.kind === "browse"}
						isDark={isDark}
						onClick={(): void => {
							setView({ kind: "browse" });
						}}
					>
						Browse
					</Chip>
					<Chip
						active={view.kind === "post"}
						isDark={isDark}
						onClick={(): void => {
							setView({ kind: "post" });
						}}
					>
						Post a bounty
					</Chip>
				</div>
			</div>

			{view.kind === "browse" ? (
				<BrowseBounties
					isDark={isDark}
					onOpen={(bountyId): void => {
						setView({ kind: "detail", bountyId });
					}}
				/>
			) : null}
			{view.kind === "post" ? (
				<PostBounty
					isDark={isDark}
					onCreated={(bountyId): void => {
						setView({ kind: "detail", bountyId });
					}}
				/>
			) : null}
			{view.kind === "detail" ? (
				<BountyDetail
					bountyId={view.bountyId}
					isDark={isDark}
					onBack={(): void => {
						setView({ kind: "browse" });
					}}
				/>
			) : null}
		</div>
	);
};

function BrowseBounties({
	isDark,
	onOpen,
}: {
	isDark: boolean;
	onOpen: (bountyId: string) => void;
}): FunctionComponent {
	const { data, isLoading, error } = useBounties();
	const bounties = data?.bounties ?? [];

	if (isLoading) {
		return <p className={mutedClass(isDark)}>Loading bounties…</p>;
	}
	if (error) {
		return (
			<p className="text-sm text-danger">
				{errorMessage(error, "Failed to load bounties")}
			</p>
		);
	}
	if (bounties.length === 0) {
		return (
			<p className={mutedClass(isDark)}>
				No bounties yet. Post one to get started.
			</p>
		);
	}
	return (
		<div className="grid gap-2 sm:grid-cols-2">
			{bounties.map((bounty) => (
				<button
					key={bounty.bountyId}
					className={`${cardClass(isDark)} text-left transition hover:border-primary`}
					type="button"
					onClick={(): void => {
						onOpen(bounty.bountyId);
					}}
				>
					<div className="flex items-start gap-3">
						{bounty.thumbnail ? (
							<img
								alt=""
								className="h-14 w-14 shrink-0 rounded object-cover"
								src={`${API_BASE_URL}/bounties/${encodeURIComponent(bounty.bountyId)}/thumbnail`}
							/>
						) : null}
						<div className="min-w-0 flex-1">
							<div className="flex items-center justify-between gap-2">
								<span className={`truncate ${strongClass(isDark)}`}>
									{bounty.title}
								</span>
								<StatusBadge status={bounty.status} />
							</div>
							<p className={`mt-1 line-clamp-2 text-sm ${mutedClass(isDark)}`}>
								{bounty.description}
							</p>
							<div className="mt-2 flex items-center justify-between text-xs">
								<span className={strongClass(isDark)}>
									{formatTokenAmount(bounty.reward.amount, bounty.reward.asset)}
								</span>
								<span className={mutedClass(isDark)}>
									due {formatDeadline(bounty.deadline)}
								</span>
							</div>
						</div>
					</div>
				</button>
			))}
		</div>
	);
}

function PostBounty({
	isDark,
	onCreated,
}: {
	isDark: boolean;
	onCreated: (bountyId: string) => void;
}): FunctionComponent {
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [amount, setAmount] = useState("10");
	const [asset, setAsset] = useState("CASH");
	const [durationDays, setDurationDays] = useState("7");
	const create = useCreateBounty();

	return (
		<form
			className={`${cardClass(isDark)} space-y-3`}
			onSubmit={(event): void => {
				event.preventDefault();
				create.mutate(
					{
						amount,
						asset,
						description,
						durationDays: Number(durationDays),
						title,
					},
					{
						onSuccess: (bounty): void => {
							onCreated(bounty.bountyId);
						},
					}
				);
			}}
		>
			<div>
				<label className={labelClass(isDark)}>Title</label>
				<input
					required
					className={inputClass(isDark)}
					placeholder="Design a logo for @acme"
					value={title}
					onChange={(event): void => {
						setTitle(event.target.value);
					}}
				/>
			</div>
			<div>
				<label className={labelClass(isDark)}>Description</label>
				<textarea
					required
					className={inputClass(isDark)}
					placeholder="What does the winning submission need to deliver?"
					rows={4}
					value={description}
					onChange={(event): void => {
						setDescription(event.target.value);
					}}
				/>
			</div>
			<div className="grid grid-cols-3 gap-2">
				<div>
					<label className={labelClass(isDark)}>Reward</label>
					<input
						required
						className={inputClass(isDark)}
						inputMode="decimal"
						placeholder="10"
						value={amount}
						onChange={(event): void => {
							setAmount(event.target.value);
						}}
					/>
				</div>
				<div>
					<label className={labelClass(isDark)}>Asset</label>
					<select
						className={selectClass(isDark)}
						value={asset}
						onChange={(event): void => {
							setAsset(event.target.value);
						}}
					>
						{BOUNTY_ASSETS.map((option) => (
							<option key={option} value={option}>
								{option}
							</option>
						))}
					</select>
				</div>
				<div>
					<label className={labelClass(isDark)}>Duration (days)</label>
					<input
						className={inputClass(isDark)}
						max={31}
						min={1}
						type="number"
						value={durationDays}
						onChange={(event): void => {
							setDurationDays(event.target.value);
						}}
					/>
				</div>
			</div>
			<p className={`text-xs ${mutedClass(isDark)}`}>
				Creating funds the reward into escrow via your wallet (x402). Duration
				must be 1–31 days. After the deadline a council of LLM judges picks the
				winner; an admin approves the payout.
			</p>
			{create.error ? (
				<p className="text-sm text-danger">
					{errorMessage(create.error, "Failed to create bounty")}
				</p>
			) : null}
			<button
				className={primaryButtonClass()}
				disabled={create.isPending}
				type="submit"
			>
				{create.isPending
					? "Creating & funding…"
					: `Create & fund ${amount || "0"} ${asset}`}
			</button>
		</form>
	);
}

function BountyDetail({
	bountyId,
	isDark,
	onBack,
}: {
	bountyId: string;
	isDark: boolean;
	onBack: () => void;
}): FunctionComponent {
	const { data: bounty, isLoading } = useBounty(bountyId);
	const agentId = useAuthStore((state) => state.agentId);
	const fund = useFundBounty();
	const runCouncil = useRunCouncil(bountyId);
	const approve = useApproveBounty(bountyId);
	const uploadThumbnail = useUploadThumbnail(bountyId);

	if (isLoading || !bounty) {
		return <p className={mutedClass(isDark)}>Loading bounty…</p>;
	}
	const isCreator = Boolean(agentId) && agentId === bounty.creator;

	return (
		<div className="space-y-3">
			<button
				className={`text-sm ${mutedClass(isDark)} hover:underline`}
				type="button"
				onClick={onBack}
			>
				← Back to bounties
			</button>

			<div className={`${cardClass(isDark)} space-y-3`}>
				<div className="flex items-start gap-3">
					{bounty.thumbnail ? (
						<img
							alt=""
							className="h-20 w-20 shrink-0 rounded object-cover"
							src={`${API_BASE_URL}/bounties/${encodeURIComponent(bounty.bountyId)}/thumbnail`}
						/>
					) : null}
					<div className="min-w-0 flex-1">
						<div className="flex items-center justify-between gap-2">
							<h2 className={`text-lg ${strongClass(isDark)}`}>
								{bounty.title}
							</h2>
							<StatusBadge status={bounty.status} />
						</div>
						<p className={`mt-1 text-sm ${mutedClass(isDark)}`}>
							{bounty.description}
						</p>
						<div className="mt-2 flex flex-wrap gap-4 text-sm">
							<span className={strongClass(isDark)}>
								{formatTokenAmount(bounty.reward.amount, bounty.reward.asset)}
							</span>
							<span className={mutedClass(isDark)}>
								deadline {formatDeadline(bounty.deadline)}
							</span>
							<span className={mutedClass(isDark)}>
								{bounty.submissionCount} submissions
							</span>
						</div>
					</div>
				</div>

				{isCreator && bounty.status === "draft" ? (
					<div className="space-y-2">
						<button
							className={primaryButtonClass()}
							disabled={fund.isPending}
							type="button"
							onClick={(): void => {
								fund.mutate({ bountyId, creator: bounty.creator });
							}}
						>
							{fund.isPending
								? "Funding…"
								: `Fund ${formatTokenAmount(bounty.reward.amount, bounty.reward.asset)} into escrow`}
						</button>
						{fund.error ? (
							<p className="text-sm text-danger">
								{errorMessage(fund.error, "Funding failed")}
							</p>
						) : null}
						<ThumbnailUpload
							bountyCreator={bounty.creator}
							isDark={isDark}
							pending={uploadThumbnail.isPending}
							onUpload={(file): void => {
								uploadThumbnail.mutate({ creator: bounty.creator, file });
							}}
						/>
					</div>
				) : null}

				{bounty.status === "open" ? (
					<button
						className={secondaryButtonClass(isDark)}
						disabled={runCouncil.isPending}
						type="button"
						onClick={(): void => {
							runCouncil.mutate();
						}}
					>
						{runCouncil.isPending ? "Convening council…" : "Run council now"}
					</button>
				) : null}

				{bounty.status === "review" ? (
					<div className="space-y-2">
						<button
							className={primaryButtonClass()}
							disabled={approve.isPending}
							type="button"
							onClick={(): void => {
								approve.mutate({});
							}}
						>
							{approve.isPending ? "Approving…" : "Approve winner & pay out"}
						</button>
						{approve.error ? (
							<p className="text-sm text-danger">
								{errorMessage(approve.error, "Approval failed")}
							</p>
						) : null}
					</div>
				) : null}

				{bounty.winnerAgent ? (
					<p className={`text-sm ${strongClass(isDark)}`}>
						Winner: {bounty.winnerAgent}
						{bounty.payoutTxSig ? " (paid)" : ""}
					</p>
				) : null}
			</div>

			{bounty.council ? (
				<CouncilVerdict bounty={bounty} isDark={isDark} />
			) : null}

			<Submissions bounty={bounty} isDark={isDark} />
			<Comments bountyId={bountyId} isDark={isDark} />
		</div>
	);
}

function ThumbnailUpload({
	bountyCreator,
	isDark,
	onUpload,
	pending,
}: {
	bountyCreator: string;
	isDark: boolean;
	onUpload: (file: File) => void;
	pending: boolean;
}): FunctionComponent {
	void bountyCreator;
	return (
		<label className={`block text-xs ${mutedClass(isDark)}`}>
			{pending ? "Uploading thumbnail…" : "Upload a thumbnail (auto-cropped)"}
			<input
				accept="image/*"
				className="mt-1 block text-xs"
				type="file"
				onChange={(event): void => {
					const file = event.target.files?.[0];
					if (file) {
						onUpload(file);
					}
				}}
			/>
		</label>
	);
}

function CouncilVerdict({
	bounty,
	isDark,
}: {
	bounty: Bounty;
	isDark: boolean;
}): FunctionComponent {
	const council = bounty.council;
	if (!council) {
		return null;
	}
	return (
		<div className={`${cardClass(isDark)} space-y-2`}>
			<div className="flex items-center justify-between">
				<span className={strongClass(isDark)}>Council verdict</span>
				<span className={`text-xs ${mutedClass(isDark)}`}>
					{council.judgeModel ?? "council"}
					{council.presided ? " · presided" : ""}
				</span>
			</div>
			{council.reasoning ? (
				<p className={`text-sm ${mutedClass(isDark)}`}>{council.reasoning}</p>
			) : null}
			{council.error ? (
				<p className="text-sm text-danger">{council.error}</p>
			) : null}
			{council.votes && council.votes.length > 0 ? (
				<ul className={`space-y-1 text-xs ${mutedClass(isDark)}`}>
					{council.votes.map((vote, index) => (
						<li key={`${vote.model}-${index}`}>
							{vote.model}: {vote.winnerSubmissionId ?? vote.error ?? "—"}
						</li>
					))}
				</ul>
			) : null}
		</div>
	);
}

function Submissions({
	bounty,
	isDark,
}: {
	bounty: Bounty;
	isDark: boolean;
}): FunctionComponent {
	const { data } = useBountySubmissions(bounty.bountyId);
	const submit = useSubmitToBounty(bounty.bountyId);
	const [url, setUrl] = useState("");
	const [note, setNote] = useState("");
	const submissions = data?.submissions ?? [];

	return (
		<div className={`${cardClass(isDark)} space-y-3`}>
			<span className={strongClass(isDark)}>
				Submissions ({submissions.length})
			</span>
			{submissions.length === 0 ? (
				<p className={`text-sm ${mutedClass(isDark)}`}>No submissions yet.</p>
			) : (
				<ul className="space-y-2">
					{submissions.map((submission: BountySubmission) => (
						<li
							key={submission.submissionId}
							className="flex items-center justify-between gap-2 text-sm"
						>
							<a
								className="truncate text-primary hover:underline"
								href={submission.url}
								rel="noreferrer"
								target="_blank"
							>
								{submission.title || submission.url}
							</a>
							<span className={`shrink-0 text-xs ${mutedClass(isDark)}`}>
								{submission.submitter}
							</span>
							<StatusBadge status={submission.status} />
						</li>
					))}
				</ul>
			)}

			{bounty.status === "open" ? (
				<form
					className="space-y-2 border-t border-border pt-3"
					onSubmit={(event): void => {
						event.preventDefault();
						submit.mutate(
							{ note, url },
							{
								onSuccess: (): void => {
									setUrl("");
									setNote("");
								},
							}
						);
					}}
				>
					<label className={labelClass(isDark)}>Submit your work (URL)</label>
					<input
						required
						className={inputClass(isDark)}
						placeholder="https://…"
						type="url"
						value={url}
						onChange={(event): void => {
							setUrl(event.target.value);
						}}
					/>
					<input
						className={inputClass(isDark)}
						placeholder="Optional note"
						value={note}
						onChange={(event): void => {
							setNote(event.target.value);
						}}
					/>
					{submit.error ? (
						<p className="text-sm text-danger">
							{errorMessage(submit.error, "Submission failed")}
						</p>
					) : null}
					<button
						className={primaryButtonClass()}
						disabled={submit.isPending}
						type="submit"
					>
						{submit.isPending ? "Submitting…" : "Submit"}
					</button>
				</form>
			) : null}
		</div>
	);
}

function Comments({
	bountyId,
	isDark,
}: {
	bountyId: string;
	isDark: boolean;
}): FunctionComponent {
	const { data } = useBountyComments(bountyId);
	const comment = useCommentOnBounty(bountyId);
	const [body, setBody] = useState("");
	const comments = data?.comments ?? [];

	return (
		<div className={`${cardClass(isDark)} space-y-3`}>
			<span className={strongClass(isDark)}>Comments ({comments.length})</span>
			<ul className="space-y-2">
				{comments.map((entry) => (
					<li key={entry.commentId} className="text-sm">
						<span className={strongClass(isDark)}>{entry.author}</span>{" "}
						<span className={mutedClass(isDark)}>{entry.body}</span>
					</li>
				))}
			</ul>
			<form
				className="flex gap-2 border-t border-border pt-3"
				onSubmit={(event): void => {
					event.preventDefault();
					comment.mutate(
						{ body },
						{
							onSuccess: (): void => {
								setBody("");
							},
						}
					);
				}}
			>
				<input
					required
					className={inputClass(isDark)}
					placeholder="Add a comment (free)"
					value={body}
					onChange={(event): void => {
						setBody(event.target.value);
					}}
				/>
				<button
					className={primaryButtonClass()}
					disabled={comment.isPending}
					type="submit"
				>
					Post
				</button>
			</form>
		</div>
	);
}
