"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { Escrow, EscrowEvidenceType } from "@tinyhumansai/tinyplace";

import type { FunctionComponent } from "@src/common/types";
import {
	useAcceptEscrowMediation,
	useEscrowDispute,
	useRejectEscrowMediation,
	useSubmitEscrowEvidence,
} from "@src/hooks/use-escrow";
import {
	firstActiveIdentity,
	useOwnedIdentities,
} from "@src/hooks/use-marketplace";
import { useAuthStore } from "@src/store/auth";

import {
	cardClass,
	errorMessage,
	formatDate,
	inputClass,
	labelClass,
	mutedClass,
	primaryButtonClass,
	secondaryButtonClass,
	selectClass,
	strongClass,
} from "./shared";
import { StatusBadge } from "./StatusBadge";
import { escrowRole, useMyEscrows } from "./use-my-escrows";

const EVIDENCE_TYPES: Array<EscrowEvidenceType> = [
	"message",
	"delivery",
	"file",
	"external_link",
	"transaction",
];

function DisputeCard({
	actor,
	escrow,
	isDark,
}: {
	actor: string;
	escrow: Escrow;
	isDark: boolean;
}): React.ReactElement {
	const { t } = useTranslation();
	const escrowId = escrow.escrowId;
	const disputeQuery = useEscrowDispute(escrowId);
	const submitEvidence = useSubmitEscrowEvidence();
	const acceptMediation = useAcceptEscrowMediation();
	const rejectMediation = useRejectEscrowMediation();

	const [evidenceOpen, setEvidenceOpen] = useState(false);
	const [evidenceType, setEvidenceType] =
		useState<EscrowEvidenceType>("message");
	const [evidenceText, setEvidenceText] = useState("");
	const [evidenceRef, setEvidenceRef] = useState("");

	const dispute = disputeQuery.data ?? escrow.dispute;
	const isPending =
		submitEvidence.isPending ||
		acceptMediation.isPending ||
		rejectMediation.isPending;
	const actionError =
		submitEvidence.error ?? acceptMediation.error ?? rejectMediation.error;
	const secondary = secondaryButtonClass(isDark);

	const handleEvidence = (): void => {
		if (!evidenceText.trim()) {
			return;
		}
		submitEvidence.mutate(
			{
				actor,
				description: evidenceText.trim(),
				escrowId,
				ref: evidenceRef.trim() || undefined,
				type: evidenceType,
			},
			{
				onSuccess: (): void => {
					setEvidenceOpen(false);
					setEvidenceText("");
					setEvidenceRef("");
				},
			}
		);
	};

	return (
		<div className={cardClass(isDark)}>
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<p className={`truncate text-sm font-medium ${strongClass(isDark)}`}>
						{escrow.terms.description}
					</p>
					<p className={`mt-0.5 text-[10px] ${mutedClass(isDark)}`}>
						{escrowId} · {escrow.amount} {escrow.asset}
					</p>
				</div>
				{dispute && <StatusBadge isDark={isDark} status={dispute.status} />}
			</div>

			{dispute ? (
				<div className="mt-3 space-y-2 text-xs">
					<div
						className={`grid grid-cols-3 gap-2 text-[10px] ${mutedClass(isDark)}`}
					>
						<div>
							<p>{t("marketplace.disputes.tier")}</p>
							<p className={isDark ? "text-neutral-300" : "text-neutral-700"}>
								{dispute.tier}
							</p>
						</div>
						<div>
							<p>{t("marketplace.disputes.openedBy")}</p>
							<p
								className={`truncate ${isDark ? "text-neutral-300" : "text-neutral-700"}`}
							>
								{dispute.openedBy}
							</p>
						</div>
						<div>
							<p>{t("marketplace.disputes.opened")}</p>
							<p className={isDark ? "text-neutral-300" : "text-neutral-700"}>
								{formatDate(dispute.openedAt)}
							</p>
						</div>
					</div>

					<p className={isDark ? "text-neutral-300" : "text-neutral-700"}>
						{dispute.reason}
					</p>

					{dispute.evidence && dispute.evidence.length > 0 && (
						<p className={`text-[10px] ${mutedClass(isDark)}`}>
							{t("marketplace.disputes.evidenceCount", {
								count: dispute.evidence.length,
							})}
						</p>
					)}

					{dispute.proposal && (
						<div
							className={`rounded-md border p-2 text-[10px] ${
								isDark
									? "border-neutral-800 bg-neutral-900"
									: "border-neutral-200 bg-white"
							}`}
						>
							<p className={strongClass(isDark)}>
								{t("marketplace.disputes.mediationProposal")}
							</p>
							<p className={mutedClass(isDark)}>
								{dispute.proposal.resolution}
							</p>
							{dispute.proposal.rationale && (
								<p className={mutedClass(isDark)}>
									{dispute.proposal.rationale}
								</p>
							)}
						</div>
					)}

					{dispute.arbitrationOutcome && (
						<div
							className={`rounded-md border p-2 text-[10px] ${
								isDark
									? "border-neutral-800 bg-neutral-900"
									: "border-neutral-200 bg-white"
							}`}
						>
							<p className={strongClass(isDark)}>
								{t("marketplace.disputes.arbitrationOutcome")}
							</p>
							<p className={mutedClass(isDark)}>
								{t("marketplace.disputes.arbitrationResolution", {
									resolution: dispute.arbitrationOutcome.resolution,
									round: dispute.arbitrationOutcome.round,
								})}
							</p>
						</div>
					)}

					<div className="flex flex-wrap gap-2 pt-1">
						<button
							className={secondary}
							disabled={isPending}
							type="button"
							onClick={(): void => {
								setEvidenceOpen((open) => !open);
							}}
						>
							{t("marketplace.disputes.submitEvidence")}
						</button>
						{dispute.proposal && dispute.status === "proposed" && (
							<>
								<button
									className={primaryButtonClass()}
									disabled={isPending}
									type="button"
									onClick={(): void => {
										acceptMediation.mutate({ actor, escrowId });
									}}
								>
									{t("marketplace.disputes.acceptMediation")}
								</button>
								<button
									className={secondary}
									disabled={isPending}
									type="button"
									onClick={(): void => {
										rejectMediation.mutate({ actor, escrowId });
									}}
								>
									{t("marketplace.disputes.rejectMediation")}
								</button>
							</>
						)}
					</div>

					{evidenceOpen && (
						<div className="space-y-2 pt-1">
							<div>
								<label className={labelClass(isDark)}>
									{t("marketplace.disputes.evidenceType")}
								</label>
								<select
									className={selectClass(isDark)}
									value={evidenceType}
									onChange={(event): void => {
										setEvidenceType(event.target.value as EscrowEvidenceType);
									}}
								>
									{EVIDENCE_TYPES.map(
										(option): React.ReactElement => (
											<option key={option} value={option}>
												{t(`marketplace.disputes.evidenceTypes.${option}`, {
													defaultValue: option.replace(/_/g, " "),
												})}
											</option>
										)
									)}
								</select>
							</div>
							<textarea
								className={`${inputClass(isDark)} min-h-[56px] resize-none`}
								placeholder={t("marketplace.disputes.evidenceTextPlaceholder")}
								rows={2}
								value={evidenceText}
								onChange={(event): void => {
									setEvidenceText(event.target.value);
								}}
							/>
							<input
								className={inputClass(isDark)}
								placeholder={t("marketplace.disputes.evidenceRefPlaceholder")}
								type="text"
								value={evidenceRef}
								onChange={(event): void => {
									setEvidenceRef(event.target.value);
								}}
							/>
							<button
								className={primaryButtonClass()}
								disabled={isPending || !evidenceText.trim()}
								type="button"
								onClick={handleEvidence}
							>
								{t("common.submit")}
							</button>
						</div>
					)}
				</div>
			) : (
				<p className={`mt-2 text-xs ${mutedClass(isDark)}`}>
					{disputeQuery.isLoading
						? t("marketplace.disputes.loadingDispute")
						: t("marketplace.disputes.unavailable")}
				</p>
			)}

			{actionError && (
				<p className="mt-2 text-xs text-red-500">
					{errorMessage(actionError, t("marketplace.disputes.actionFailed"))}
				</p>
			)}
		</div>
	);
}

export const Disputes = ({
	isDark,
}: {
	isDark: boolean;
}): FunctionComponent => {
	const { t } = useTranslation();
	const agentId = useAuthStore((state) => state.agentId);
	const ownedIdentities = useOwnedIdentities(agentId);
	const sellerIdentity = firstActiveIdentity(ownedIdentities.data?.identities);
	const actor = sellerIdentity?.username ?? agentId ?? "";
	const { escrows, isError, isLoading } = useMyEscrows(actor || undefined);

	if (!agentId) {
		return (
			<div className={`${cardClass(isDark)} p-6 text-center`}>
				<p className={`text-sm ${mutedClass(isDark)}`}>
					{t("marketplace.disputes.connectPrompt")}
				</p>
			</div>
		);
	}

	const disputed = escrows.filter((escrow) => escrow.status === "disputed");

	if (isLoading) {
		return (
			<p className={`text-xs ${mutedClass(isDark)}`}>
				{t("marketplace.disputes.loading")}
			</p>
		);
	}
	if (isError) {
		return (
			<p className="text-xs text-red-500">
				{t("marketplace.disputes.loadError")}
			</p>
		);
	}
	if (disputed.length === 0) {
		return (
			<p className={`text-xs ${mutedClass(isDark)}`}>
				{t("marketplace.disputes.empty")}
			</p>
		);
	}

	return (
		<div className="space-y-3">
			{disputed.map((escrow) => {
				const role = escrowRole(escrow, actor, agentId);
				if (!role) {
					return null;
				}
				return (
					<DisputeCard
						key={escrow.escrowId}
						actor={actor}
						escrow={escrow}
						isDark={isDark}
					/>
				);
			})}
		</div>
	);
};
