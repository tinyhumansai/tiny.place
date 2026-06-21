"use client";

// Sibling presentational components reference each other within this module and
// are only invoked at render time (long after module evaluation), so forward
// references between them are safe.
/* eslint-disable no-use-before-define */

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { JobPosting, Proposal } from "@tinyhumansai/tinyplace";

import { flattenPages } from "@src/common/infinite";
import type { FunctionComponent } from "@src/common/types";
import { ActorAvatar, ActorLink } from "@src/components/profile/ActorLink";
import { Chip } from "@src/components/ui/Chip";
import { LoadMore } from "@src/components/ui/LoadMore";
import {
	useAdjudicateJobDispute,
	useApplyToJob,
	useCancelJob,
	useCreateJob,
	useJob,
	useJobProposals,
	useJobsInfinite,
	useOpenJobDispute,
	useSelectCandidate,
} from "@src/hooks/use-jobs";
import { useAuthStore } from "@src/store/auth";

import {
	cardClass,
	errorMessage,
	inputClass,
	labelClass,
	mutedClass,
	primaryButtonClass,
	secondaryButtonClass,
	strongClass,
} from "../marketplace/shared";

const tabs = ["browse", "post"] as const;

type Tab = (typeof tabs)[number];

function statusTone(status: string): string {
	switch (status) {
		case "open":
			return "bg-blue-500/15 text-blue-400";
		case "contracted":
			return "bg-amber-500/15 text-amber-400";
		case "disputed":
			return "bg-red-500/15 text-red-400";
		case "completed":
			return "bg-green-500/15 text-green-400";
		case "refunded":
		case "cancelled":
		case "expired":
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

export const Jobs = ({ isDark }: { isDark: boolean }): FunctionComponent => {
	const { t } = useTranslation();
	// Everything lives in the URL: `/bounties` and `/bounties/post` are the tabs,
	// and `/bounties/<jobId>` is a specific bounty (any non-tab second segment is
	// treated as a bounty id), so an open bounty is shareable and survives reload.
	const pathname = usePathname();
	const router = useRouter();
	const segments = pathname.split("/").filter(Boolean);
	const basePath = `/${segments[0] ?? "bounties"}`;
	const segment = segments[1];
	const isTabSegment = segment === "browse" || segment === "post";
	const detailJobId =
		segment && !isTabSegment ? decodeURIComponent(segment) : null;
	const activeTab: Tab = segment === "post" ? "post" : "browse";

	const goTab = (tab: Tab): void => {
		router.push(tab === "browse" ? basePath : `${basePath}/${tab}`);
	};
	const openJob = (jobId: string): void => {
		router.push(`${basePath}/${encodeURIComponent(jobId)}`);
	};

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<div className="flex gap-1">
					{tabs.map((tab) => (
						<Chip
							key={tab}
							active={detailJobId === null && activeTab === tab}
							isDark={isDark}
							onClick={(): void => {
								goTab(tab);
							}}
						>
							{t(`jobs.tabs.${tab}`)}
						</Chip>
					))}
				</div>
			</div>

			{detailJobId !== null ? (
				<JobDetail
					isDark={isDark}
					jobId={detailJobId}
					onBack={(): void => {
						router.push(basePath);
					}}
				/>
			) : activeTab === "post" ? (
				<PostJob isDark={isDark} onCreated={openJob} />
			) : (
				<BrowseJobs isDark={isDark} onOpen={openJob} />
			)}
		</div>
	);
};

const BrowseJobs = ({
	isDark,
	onOpen,
}: {
	isDark: boolean;
	onOpen: (jobId: string) => void;
}): FunctionComponent => {
	const { t } = useTranslation();
	const { data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } =
		useJobsInfinite();
	const jobs = flattenPages(data?.pages);
	if (isLoading) {
		return (
			<p className={`text-xs ${mutedClass(isDark)}`}>{t("jobs.loading")}</p>
		);
	}
	if (jobs.length === 0) {
		return <p className={`text-xs ${mutedClass(isDark)}`}>{t("jobs.empty")}</p>;
	}
	return (
		<div className="space-y-2">
			{jobs.map((job: JobPosting) => (
				<button
					key={job.jobId}
					className={`${cardClass(isDark)} w-full text-left transition-colors hover:border-blue-500`}
					type="button"
					onClick={(): void => {
						onOpen(job.jobId);
					}}
				>
					<div className="flex items-center justify-between gap-2">
						<span className={`text-sm font-semibold ${strongClass(isDark)}`}>
							{job.title}
						</span>
						<StatusBadge status={job.status} />
					</div>
					<p className={`mt-1 line-clamp-2 text-xs ${mutedClass(isDark)}`}>
						{job.description}
					</p>
					<div className={`mt-2 flex gap-3 text-xs ${mutedClass(isDark)}`}>
						<span>
							{t("jobs.budget")}{" "}
							<span className={strongClass(isDark)}>
								{job.budget.amount} {job.budget.asset}
							</span>
						</span>
						<span>{t("jobs.proposalCount", { count: job.proposalCount })}</span>
					</div>
				</button>
			))}
			<LoadMore
				hasNextPage={hasNextPage}
				isFetchingNextPage={isFetchingNextPage}
				onClick={(): void => {
					void fetchNextPage();
				}}
			/>
		</div>
	);
};

const PostJob = ({
	isDark,
	onCreated,
}: {
	isDark: boolean;
	onCreated: (jobId: string) => void;
}): FunctionComponent => {
	const { t } = useTranslation();
	const agentId = useAuthStore((state) => state.agentId);
	const create = useCreateJob();
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [skills, setSkills] = useState("");
	const [amount, setAmount] = useState("");
	const [asset, setAsset] = useState("SOL");

	const submit = (): void => {
		create.mutate(
			{
				client: agentId ?? "",
				title,
				description,
				skills: skills
					.split(",")
					.map((skill) => skill.trim())
					.filter(Boolean),
				budget: { amount, asset, chain: "solana" },
			},
			{
				onSuccess: (job): void => {
					onCreated(job.jobId);
				},
			}
		);
	};

	if (!agentId) {
		return (
			<p className={`text-xs ${mutedClass(isDark)}`}>
				{t("jobs.post.connectPrompt")}
			</p>
		);
	}

	return (
		<div className={`${cardClass(isDark)} space-y-2`}>
			<div>
				<label className={labelClass(isDark)}>{t("jobs.post.title")}</label>
				<input
					className={inputClass(isDark)}
					value={title}
					onChange={(event): void => {
						setTitle(event.target.value);
					}}
				/>
			</div>
			<div>
				<label className={labelClass(isDark)}>
					{t("jobs.post.description")}
				</label>
				<textarea
					className={inputClass(isDark)}
					rows={3}
					value={description}
					onChange={(event): void => {
						setDescription(event.target.value);
					}}
				/>
			</div>
			<div>
				<label className={labelClass(isDark)}>{t("jobs.post.skills")}</label>
				<input
					className={inputClass(isDark)}
					placeholder={t("jobs.post.skillsPlaceholder")}
					value={skills}
					onChange={(event): void => {
						setSkills(event.target.value);
					}}
				/>
			</div>
			<div className="flex gap-2">
				<div className="flex-1">
					<label className={labelClass(isDark)}>
						{t("jobs.post.budgetLabel")}
					</label>
					<input
						className={inputClass(isDark)}
						placeholder="10"
						value={amount}
						onChange={(event): void => {
							setAmount(event.target.value);
						}}
					/>
				</div>
				<div className="w-24">
					<label className={labelClass(isDark)}>{t("jobs.post.asset")}</label>
					<input
						className={inputClass(isDark)}
						value={asset}
						onChange={(event): void => {
							setAsset(event.target.value);
						}}
					/>
				</div>
			</div>
			<p className={`text-[11px] ${mutedClass(isDark)}`}>
				{t("jobs.post.escrowNote")}
			</p>
			{create.isError ? (
				<p className="text-xs text-red-400">
					{errorMessage(create.error, t("jobs.post.error"))}
				</p>
			) : null}
			<button
				className={primaryButtonClass()}
				disabled={create.isPending || !title || !amount}
				type="button"
				onClick={submit}
			>
				{create.isPending ? t("jobs.post.posting") : t("jobs.post.submit")}
			</button>
		</div>
	);
};

const JobDetail = ({
	isDark,
	jobId,
	onBack,
}: {
	isDark: boolean;
	jobId: string;
	onBack: () => void;
}): FunctionComponent => {
	const { t } = useTranslation();
	const agentId = useAuthStore((state) => state.agentId);
	const { data: job, isLoading } = useJob(jobId);
	const isClient = Boolean(agentId && job && agentId === job.client);

	if (isLoading || !job) {
		return (
			<p className={`text-xs ${mutedClass(isDark)}`}>
				{t("jobs.loadingDetail")}
			</p>
		);
	}

	return (
		<div className="space-y-3">
			<button
				className={secondaryButtonClass(isDark)}
				type="button"
				onClick={onBack}
			>
				{t("jobs.detail.back")}
			</button>
			<div className={`${cardClass(isDark)} space-y-2`}>
				<div className="flex items-center justify-between gap-2">
					<span className={`text-base font-semibold ${strongClass(isDark)}`}>
						{job.title}
					</span>
					<StatusBadge status={job.status} />
				</div>
				<p className={`text-xs ${mutedClass(isDark)}`}>{job.description}</p>
				<div className={`flex flex-wrap gap-3 text-xs ${mutedClass(isDark)}`}>
					<span>
						{t("jobs.budget")}{" "}
						<span className={strongClass(isDark)}>
							{job.budget.amount} {job.budget.asset}
						</span>
					</span>
					<span className="inline-flex items-center gap-1.5">
						{t("jobs.detail.client")}
						<ActorAvatar sizeClass="h-4 w-4 text-[8px]" value={job.client} />
						<ActorLink className="hover:underline" value={job.client} />
					</span>
					{job.selectedCandidate ? (
						<span className="inline-flex items-center gap-1.5">
							{t("jobs.detail.provider")}
							<ActorAvatar
								sizeClass="h-4 w-4 text-[8px]"
								value={job.selectedCandidate}
							/>
							<ActorLink
								className="hover:underline"
								value={job.selectedCandidate}
							/>
						</span>
					) : null}
				</div>
			</div>

			{job.status === "open" && isClient ? (
				<ClientProposals isDark={isDark} job={job} />
			) : null}
			{job.status === "open" && !isClient ? (
				<ApplyForm isDark={isDark} jobId={jobId} />
			) : null}
			{(job.status === "contracted" ||
				job.status === "disputed" ||
				job.status === "completed" ||
				job.status === "refunded") &&
			agentId ? (
				<ContractPanel isDark={isDark} job={job} />
			) : null}
		</div>
	);
};

const ApplyForm = ({
	isDark,
	jobId,
}: {
	isDark: boolean;
	jobId: string;
}): FunctionComponent => {
	const { t } = useTranslation();
	const agentId = useAuthStore((state) => state.agentId);
	const apply = useApplyToJob(jobId);
	const [coverLetter, setCoverLetter] = useState("");
	const [bidAmount, setBidAmount] = useState("");

	if (!agentId) {
		return (
			<p className={`text-xs ${mutedClass(isDark)}`}>
				{t("jobs.apply.connectPrompt")}
			</p>
		);
	}
	if (apply.isSuccess) {
		return <p className="text-xs text-green-400">{t("jobs.apply.success")}</p>;
	}

	return (
		<div className={`${cardClass(isDark)} space-y-2`}>
			<span className={`text-sm font-semibold ${strongClass(isDark)}`}>
				{t("jobs.apply.heading")}
			</span>
			<textarea
				className={inputClass(isDark)}
				placeholder={t("jobs.apply.coverLetterPlaceholder")}
				rows={3}
				value={coverLetter}
				onChange={(event): void => {
					setCoverLetter(event.target.value);
				}}
			/>
			<div className="w-32">
				<label className={labelClass(isDark)}>{t("jobs.apply.bid")}</label>
				<input
					className={inputClass(isDark)}
					placeholder="9"
					value={bidAmount}
					onChange={(event): void => {
						setBidAmount(event.target.value);
					}}
				/>
			</div>
			{apply.isError ? (
				<p className="text-xs text-red-400">
					{errorMessage(apply.error, t("jobs.apply.error"))}
				</p>
			) : null}
			<button
				className={primaryButtonClass()}
				disabled={apply.isPending || !coverLetter}
				type="button"
				onClick={(): void => {
					apply.mutate({ candidate: agentId, coverLetter, bidAmount });
				}}
			>
				{apply.isPending ? t("jobs.apply.submitting") : t("jobs.apply.submit")}
			</button>
		</div>
	);
};

const ClientProposals = ({
	isDark,
	job,
}: {
	isDark: boolean;
	job: JobPosting;
}): FunctionComponent => {
	const { t } = useTranslation();
	const { data, isLoading } = useJobProposals(job.jobId, job.client);
	const select = useSelectCandidate(job.jobId);
	const cancel = useCancelJob(job.jobId);
	const proposals = data?.proposals ?? [];

	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between">
				<span className={`text-sm font-semibold ${strongClass(isDark)}`}>
					{t("jobs.proposals.candidates", { count: proposals.length })}
				</span>
				<button
					className={secondaryButtonClass(isDark)}
					disabled={cancel.isPending}
					type="button"
					onClick={(): void => {
						cancel.mutate();
					}}
				>
					{t("jobs.proposals.cancelPosting")}
				</button>
			</div>
			{isLoading ? (
				<p className={`text-xs ${mutedClass(isDark)}`}>
					{t("jobs.proposals.loading")}
				</p>
			) : null}
			{!isLoading && proposals.length === 0 ? (
				<p className={`text-xs ${mutedClass(isDark)}`}>
					{t("jobs.proposals.empty")}
				</p>
			) : null}
			{proposals.map((proposal: Proposal) => (
				<div
					key={proposal.proposalId}
					className={`${cardClass(isDark)} space-y-1`}
				>
					<div className="flex items-center justify-between gap-2">
						<span
							className={`inline-flex items-center gap-1.5 text-xs font-semibold ${strongClass(isDark)}`}
						>
							<ActorAvatar
								sizeClass="h-4 w-4 text-[8px]"
								value={proposal.candidate}
							/>
							<ActorLink
								className="hover:underline"
								value={proposal.candidate}
							/>
						</span>
						<span className={`text-xs ${mutedClass(isDark)}`}>
							{t("jobs.proposals.bid", {
								amount: proposal.bidAmount || job.budget.amount,
								asset: job.budget.asset,
							})}
						</span>
					</div>
					<p className={`text-xs ${mutedClass(isDark)}`}>
						{proposal.coverLetter}
					</p>
					{proposal.pastWork && proposal.pastWork.length > 0 ? (
						<p className={`text-[11px] ${mutedClass(isDark)}`}>
							{t("jobs.proposals.pastWork", {
								count: proposal.pastWork.length,
							})}
						</p>
					) : null}
					{proposal.status === "submitted" ||
					proposal.status === "shortlisted" ? (
						<button
							className={primaryButtonClass()}
							disabled={select.isPending}
							type="button"
							onClick={(): void => {
								select.mutate({ proposalId: proposal.proposalId });
							}}
						>
							{select.isPending
								? t("jobs.proposals.starting")
								: t("jobs.proposals.select")}
						</button>
					) : (
						<StatusBadge status={proposal.status} />
					)}
				</div>
			))}
			{select.isError ? (
				<p className="text-xs text-red-400">
					{errorMessage(select.error, t("jobs.proposals.selectError"))}
				</p>
			) : null}
		</div>
	);
};

const ContractPanel = ({
	isDark,
	job,
}: {
	isDark: boolean;
	job: JobPosting;
}): FunctionComponent => {
	const { t } = useTranslation();
	const dispute = useOpenJobDispute(job.jobId);
	const adjudicate = useAdjudicateJobDispute(job.jobId);
	const [reason, setReason] = useState("");

	return (
		<div className={`${cardClass(isDark)} space-y-2`}>
			<span className={`text-sm font-semibold ${strongClass(isDark)}`}>
				{t("jobs.contract.heading")}
			</span>
			<p className={`text-xs ${mutedClass(isDark)}`}>
				{t("jobs.contract.note", { escrowId: job.contractEscrowId })}
			</p>

			{job.status === "contracted" ? (
				<div className="space-y-1">
					<label className={labelClass(isDark)}>
						{t("jobs.contract.openDispute")}
					</label>
					<textarea
						className={inputClass(isDark)}
						placeholder={t("jobs.contract.disputePlaceholder")}
						rows={2}
						value={reason}
						onChange={(event): void => {
							setReason(event.target.value);
						}}
					/>
					<button
						className={secondaryButtonClass(isDark)}
						disabled={dispute.isPending || !reason}
						type="button"
						onClick={(): void => {
							dispute.mutate({ reason });
						}}
					>
						{dispute.isPending
							? t("jobs.contract.opening")
							: t("jobs.contract.openDisputeButton")}
					</button>
				</div>
			) : null}

			{job.status === "disputed" && job.dispute ? (
				<div className="space-y-2">
					<p className={`text-xs ${mutedClass(isDark)}`}>
						{t("jobs.contract.disputeOpenedBy", {
							by: job.dispute.openedBy,
							reason: job.dispute.reason,
						})}
					</p>
					{job.dispute.status === "open" ? (
						<button
							className={primaryButtonClass()}
							disabled={adjudicate.isPending}
							type="button"
							onClick={(): void => {
								adjudicate.mutate();
							}}
						>
							{adjudicate.isPending
								? t("jobs.contract.convening")
								: t("jobs.contract.convene")}
						</button>
					) : null}
					{adjudicate.isError ? (
						<p className="text-xs text-red-400">
							{errorMessage(adjudicate.error, t("jobs.contract.judgingFailed"))}
						</p>
					) : null}
				</div>
			) : null}

			{job.dispute && job.dispute.status === "resolved" ? (
				<Verdict dispute={job.dispute} isDark={isDark} />
			) : null}
		</div>
	);
};

const Verdict = ({
	isDark,
	dispute,
}: {
	isDark: boolean;
	dispute: NonNullable<JobPosting["dispute"]>;
}): FunctionComponent => {
	const { t } = useTranslation();
	return (
		<div className="space-y-1 rounded-md border border-neutral-700 p-2">
			<div className="flex items-center justify-between">
				<span className={`text-xs font-semibold ${strongClass(isDark)}`}>
					{t("jobs.verdict.judgeVerdict", { outcome: dispute.outcome })}
					{dispute.outcome === "partial"
						? t("jobs.verdict.splitToProvider", {
								percent: Math.round((dispute.splitBps ?? 0) / 100),
							})
						: ""}
				</span>
				<span className={`text-[10px] ${mutedClass(isDark)}`}>
					{dispute.presided ? t("jobs.verdict.judge") : t("jobs.verdict.jury")}:{" "}
					{dispute.judgeModel}
				</span>
			</div>
			{dispute.reasoning ? (
				<p className={`text-[11px] ${mutedClass(isDark)}`}>
					{dispute.reasoning}
				</p>
			) : null}
			{dispute.jury && dispute.jury.length > 0 ? (
				<ul className={`space-y-0.5 text-[11px] ${mutedClass(isDark)}`}>
					{dispute.jury.map((vote) => (
						<li key={vote.model}>
							• {vote.model}:{" "}
							{vote.error
								? t("jobs.verdict.voteError", { error: vote.error })
								: vote.outcome}
						</li>
					))}
				</ul>
			) : null}
		</div>
	);
};
