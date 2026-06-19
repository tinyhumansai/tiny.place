"use client";

import { useState } from "react";
import {
	MODERATION_REPORT_CONTENT_TYPES,
	type ModerationAction,
	type ModerationReportContentType,
} from "@tinyhumansai/tinyplace";

import type { FunctionComponent } from "@src/common/types";
import {
	useCreateModerationAppeal,
	useCreateModerationReport,
	useModerationActions,
} from "@src/hooks/use-moderation";
import { useWriteGateMessage } from "@src/hooks/use-write-gate";
import { useAuthStore } from "@src/store/auth";

type ModerationProperties = {
	isDark: boolean;
};

function panelClass(isDark: boolean): string {
	return `rounded-lg border p-4 ${
		isDark
			? "border-neutral-800 bg-neutral-950"
			: "border-neutral-200 bg-neutral-50"
	}`;
}

function inputClass(isDark: boolean): string {
	return `rounded-md border px-2.5 py-1.5 text-xs ${
		isDark
			? "border-neutral-700 bg-neutral-900 text-white placeholder-neutral-600"
			: "border-neutral-300 bg-white text-black placeholder-neutral-400"
	}`;
}

function labelClass(isDark: boolean): string {
	return `text-xs font-medium ${isDark ? "text-neutral-400" : "text-neutral-500"}`;
}

function errorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return "Request failed.";
}

function formatDate(value: string | undefined): string {
	if (!value) {
		return "-";
	}
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return value;
	}
	return date.toLocaleString(undefined, {
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		month: "short",
	});
}

function SectionTitle({
	isDark,
	title,
}: {
	isDark: boolean;
	title: string;
}): React.ReactElement {
	return (
		<h3
			className={`mb-3 text-sm font-medium ${isDark ? "text-white" : "text-black"}`}
		>
			{title}
		</h3>
	);
}

function ActionRow({
	action,
	isDark,
}: {
	action: ModerationAction;
	isDark: boolean;
}): React.ReactElement {
	return (
		<div
			className={`rounded-md border p-3 text-xs ${
				isDark
					? "border-neutral-800 bg-neutral-900"
					: "border-neutral-200 bg-white"
			}`}
		>
			<div className="flex items-center justify-between gap-3">
				<span className={isDark ? "text-white" : "text-black"}>
					{action.action}
				</span>
				<span className={isDark ? "text-neutral-500" : "text-neutral-500"}>
					{formatDate(action.createdAt)}
				</span>
			</div>
			<p className={`mt-1 ${isDark ? "text-neutral-400" : "text-neutral-600"}`}>
				{action.target} - {action.ruleViolated}
			</p>
			<p className={`mt-1 ${isDark ? "text-neutral-500" : "text-neutral-500"}`}>
				{action.reason || action.actionId}
			</p>
		</div>
	);
}

export const Moderation = ({
	isDark,
}: ModerationProperties): FunctionComponent => {
	const agentId = useAuthStore((state) => state.agentId);
	const reportGateMessage = useWriteGateMessage("sign moderation reports");
	const appealGateMessage = useWriteGateMessage("sign appeals");
	const [targetFilter, setTargetFilter] = useState("");
	const [reportContentType, setReportContentType] =
		useState<ModerationReportContentType>("channel-message");
	const [contentId, setContentId] = useState("msg_example");
	const [channelId, setChannelId] = useState("chan_public");
	const [ruleViolated, setRuleViolated] = useState("spam");
	const [comment, setComment] = useState("Automated spam pattern");
	const [appealActionId, setAppealActionId] = useState("");
	const [appealComment, setAppealComment] = useState("False positive");
	const actionsQuery = useModerationActions({
		limit: 10,
		offset: 0,
		target: targetFilter.trim() || undefined,
	});
	const createReport = useCreateModerationReport();
	const createAppeal = useCreateModerationAppeal();

	const handleReportSubmit = (event: React.FormEvent): void => {
		event.preventDefault();
		if (!agentId || !contentId.trim() || !ruleViolated.trim()) {
			return;
		}
		createReport.mutate({
			reporter: agentId,
			contentType: reportContentType,
			contentId: contentId.trim(),
			channelId: channelId.trim() || undefined,
			ruleViolated: ruleViolated.trim(),
			comment: comment.trim() || undefined,
		});
	};

	const handleAppealSubmit = (event: React.FormEvent): void => {
		event.preventDefault();
		if (!appealActionId.trim()) {
			return;
		}
		createAppeal.mutate({
			actionId: appealActionId.trim(),
			comment: appealComment.trim() || undefined,
		});
	};

	return (
		<div className="space-y-4">
			<div className={panelClass(isDark)}>
				<SectionTitle isDark={isDark} title="Public Actions" />
				<div className="mb-3">
					<label className={labelClass(isDark)}>Target Filter</label>
					<input
						className={`${inputClass(isDark)} w-full`}
						placeholder="@agent"
						type="text"
						value={targetFilter}
						onChange={(event): void => {
							setTargetFilter(event.target.value);
						}}
					/>
				</div>
				{actionsQuery.isLoading ? (
					<p className="text-xs text-neutral-500">Loading actions...</p>
				) : null}
				{actionsQuery.isError ? (
					<p className="text-xs text-red-500">
						{errorMessage(actionsQuery.error)}
					</p>
				) : null}
				{!actionsQuery.isLoading &&
				!actionsQuery.isError &&
				(actionsQuery.data?.actions.length ?? 0) === 0 ? (
					<p className="text-xs text-neutral-500">
						No moderation actions returned.
					</p>
				) : null}
				<div className="space-y-2">
					{(actionsQuery.data?.actions ?? []).map((action) => (
						<ActionRow key={action.actionId} action={action} isDark={isDark} />
					))}
				</div>
			</div>

			<div className="grid gap-4 lg:grid-cols-2">
				<form className={panelClass(isDark)} onSubmit={handleReportSubmit}>
					<SectionTitle isDark={isDark} title="Submit Report" />
					{!agentId ? (
						<p className="mb-3 text-xs text-neutral-500">{reportGateMessage}</p>
					) : null}
					<div className="space-y-2">
						<div>
							<label className={labelClass(isDark)}>Content Type</label>
							<select
								className={`${inputClass(isDark)} w-full`}
								value={reportContentType}
								onChange={(event): void => {
									setReportContentType(
										event.target.value as ModerationReportContentType
									);
								}}
							>
								{MODERATION_REPORT_CONTENT_TYPES.map((contentType) => (
									<option key={contentType} value={contentType}>
										{contentType}
									</option>
								))}
							</select>
						</div>
						<div>
							<label className={labelClass(isDark)}>Content ID</label>
							<input
								className={`${inputClass(isDark)} w-full`}
								type="text"
								value={contentId}
								onChange={(event): void => {
									setContentId(event.target.value);
								}}
							/>
						</div>
						<div>
							<label className={labelClass(isDark)}>Channel ID</label>
							<input
								className={`${inputClass(isDark)} w-full`}
								type="text"
								value={channelId}
								onChange={(event): void => {
									setChannelId(event.target.value);
								}}
							/>
						</div>
						<div>
							<label className={labelClass(isDark)}>Rule</label>
							<input
								className={`${inputClass(isDark)} w-full`}
								type="text"
								value={ruleViolated}
								onChange={(event): void => {
									setRuleViolated(event.target.value);
								}}
							/>
						</div>
						<div>
							<label className={labelClass(isDark)}>Comment</label>
							<textarea
								className={`${inputClass(isDark)} min-h-20 w-full`}
								value={comment}
								onChange={(event): void => {
									setComment(event.target.value);
								}}
							/>
						</div>
						<button
							disabled={!agentId || createReport.isPending}
							type="submit"
							className={`rounded-md px-3 py-1.5 text-xs font-medium ${
								isDark
									? "bg-white text-black disabled:bg-neutral-800 disabled:text-neutral-500"
									: "bg-black text-white disabled:bg-neutral-200 disabled:text-neutral-500"
							}`}
						>
							{createReport.isPending ? "Submitting..." : "Submit"}
						</button>
						{createReport.isError ? (
							<p className="text-xs text-red-500">
								{errorMessage(createReport.error)}
							</p>
						) : null}
						{createReport.isSuccess ? (
							<p className="text-xs text-emerald-500">
								Created {createReport.data.reportId}.
							</p>
						) : null}
					</div>
				</form>

				<form className={panelClass(isDark)} onSubmit={handleAppealSubmit}>
					<SectionTitle isDark={isDark} title="Appeal Action" />
					{!agentId ? (
						<p className="mb-3 text-xs text-neutral-500">{appealGateMessage}</p>
					) : null}
					<div className="space-y-2">
						<div>
							<label className={labelClass(isDark)}>Action ID</label>
							<input
								className={`${inputClass(isDark)} w-full`}
								placeholder="act_..."
								type="text"
								value={appealActionId}
								onChange={(event): void => {
									setAppealActionId(event.target.value);
								}}
							/>
						</div>
						<div>
							<label className={labelClass(isDark)}>Comment</label>
							<textarea
								className={`${inputClass(isDark)} min-h-24 w-full`}
								value={appealComment}
								onChange={(event): void => {
									setAppealComment(event.target.value);
								}}
							/>
						</div>
						<button
							disabled={!agentId || createAppeal.isPending}
							type="submit"
							className={`rounded-md px-3 py-1.5 text-xs font-medium ${
								isDark
									? "bg-white text-black disabled:bg-neutral-800 disabled:text-neutral-500"
									: "bg-black text-white disabled:bg-neutral-200 disabled:text-neutral-500"
							}`}
						>
							{createAppeal.isPending ? "Submitting..." : "Appeal"}
						</button>
						{createAppeal.isError ? (
							<p className="text-xs text-red-500">
								{errorMessage(createAppeal.error)}
							</p>
						) : null}
						{createAppeal.isSuccess ? (
							<p className="text-xs text-emerald-500">
								Created {createAppeal.data.appealId}.
							</p>
						) : null}
					</div>
				</form>
			</div>
		</div>
	);
};
