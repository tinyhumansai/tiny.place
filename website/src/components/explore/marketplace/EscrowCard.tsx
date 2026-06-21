"use client";

import { useState } from "react";

import type { Escrow } from "@tinyhumansai/tinyplace";

import type { FunctionComponent } from "@src/common/types";
import {
	useAcceptEscrow,
	useAcceptEscrowDelivery,
	useApproveEscrowExtension,
	useCancelEscrow,
	useClaimEscrowRefund,
	useClaimEscrowRelease,
	useDeliverEscrow,
	useExtendEscrowDeadline,
	useOpenEscrowDispute,
	useRequestEscrowRevision,
} from "@src/hooks/use-escrow";

import {
	cardClass,
	errorMessage,
	formatDate,
	labelClass,
	mutedClass,
	primaryButtonClass,
	secondaryButtonClass,
	strongClass,
} from "./shared";
import { StatusBadge } from "./StatusBadge";
import type { EscrowRole } from "./use-my-escrows";

type TextAction = "deliver" | "revision" | "dispute" | "extend";

export const EscrowCard = ({
	actor,
	escrow,
	isDark,
	role,
}: {
	actor: string;
	escrow: Escrow;
	isDark: boolean;
	role: EscrowRole;
}): FunctionComponent => {
	const escrowId = escrow.escrowId;
	const [openAction, setOpenAction] = useState<TextAction | null>(null);
	const [text, setText] = useState("");
	const [deadline, setDeadline] = useState("");

	const accept = useAcceptEscrow();
	const deliver = useDeliverEscrow();
	const acceptDelivery = useAcceptEscrowDelivery();
	const requestRevision = useRequestEscrowRevision();
	const release = useClaimEscrowRelease();
	const refund = useClaimEscrowRefund();
	const cancel = useCancelEscrow();
	const extend = useExtendEscrowDeadline();
	const approveExtension = useApproveEscrowExtension();
	const openDispute = useOpenEscrowDispute();

	const actions = [
		accept,
		deliver,
		acceptDelivery,
		requestRevision,
		release,
		refund,
		cancel,
		extend,
		approveExtension,
		openDispute,
	];
	const isPending = actions.some((action) => action.isPending);
	const actionError = actions.find((action) => action.isError)?.error;

	const status = escrow.status;
	const isProvider = role === "provider";
	const isClient = role === "client";
	const counterparty = isProvider ? escrow.client : escrow.provider;
	const hasPendingExtension = (escrow.extensions?.length ?? 0) > 0;

	const resetForm = (): void => {
		setOpenAction(null);
		setText("");
		setDeadline("");
	};

	const toggle = (action: TextAction): void => {
		setOpenAction((current) => (current === action ? null : action));
		setText("");
		setDeadline("");
	};

	const submitText = (): void => {
		if (openAction === "deliver" && text.trim()) {
			deliver.mutate(
				{ actor, description: text.trim(), escrowId },
				{ onSuccess: resetForm }
			);
		} else if (openAction === "revision" && text.trim()) {
			requestRevision.mutate(
				{ actor, escrowId, reason: text.trim() },
				{ onSuccess: resetForm }
			);
		} else if (openAction === "dispute" && text.trim()) {
			openDispute.mutate(
				{ actor, escrowId, reason: text.trim() },
				{ onSuccess: resetForm }
			);
		} else if (openAction === "extend" && deadline) {
			extend.mutate(
				{ actor, deadline: new Date(deadline).toISOString(), escrowId },
				{ onSuccess: resetForm }
			);
		}
	};

	const secondary = secondaryButtonClass(isDark);

	return (
		<div className={cardClass(isDark)}>
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<p className={`truncate text-sm font-medium ${strongClass(isDark)}`}>
						{escrow.terms.description}
					</p>
					<p className={`mt-0.5 text-[10px] ${mutedClass(isDark)}`}>
						{escrowId}
					</p>
				</div>
				<StatusBadge isDark={isDark} status={status} />
			</div>

			<div
				className={`mt-3 grid grid-cols-4 gap-2 text-[10px] ${mutedClass(isDark)}`}
			>
				<div>
					<p>Your role</p>
					<p className={isDark ? "text-neutral-300" : "text-neutral-700"}>
						{role}
					</p>
				</div>
				<div>
					<p>{isProvider ? "Client" : "Provider"}</p>
					<p
						className={`truncate ${isDark ? "text-neutral-300" : "text-neutral-700"}`}
					>
						{counterparty}
					</p>
				</div>
				<div>
					<p>Amount</p>
					<p className={isDark ? "text-neutral-300" : "text-neutral-700"}>
						{escrow.amount} {escrow.asset}
					</p>
				</div>
				<div>
					<p>Deadline</p>
					<p className={isDark ? "text-neutral-300" : "text-neutral-700"}>
						{formatDate(escrow.terms.deadline)}
					</p>
				</div>
			</div>

			{escrow.terms.deliverables && escrow.terms.deliverables.length > 0 && (
				<div className="mt-2 flex flex-wrap gap-1">
					{escrow.terms.deliverables.map(
						(item): React.ReactElement => (
							<span
								key={item}
								className={`rounded-full px-1.5 py-0.5 text-[10px] ${
									isDark
										? "bg-neutral-800 text-neutral-500"
										: "bg-neutral-200 text-neutral-500"
								}`}
							>
								{item}
							</span>
						)
					)}
				</div>
			)}

			{(escrow.revisionCount > 0 || escrow.terms.maxRevisions > 0) && (
				<p className={`mt-2 text-[10px] ${mutedClass(isDark)}`}>
					Revisions used {escrow.revisionCount}/{escrow.terms.maxRevisions}
				</p>
			)}

			{escrow.deliveries && escrow.deliveries.length > 0 && (
				<div
					className={`mt-2 rounded-md border p-2 text-[10px] ${
						isDark
							? "border-neutral-800 bg-neutral-900"
							: "border-neutral-200 bg-white"
					}`}
				>
					<p className={mutedClass(isDark)}>Latest delivery</p>
					<p className={isDark ? "text-neutral-300" : "text-neutral-700"}>
						{escrow.deliveries[escrow.deliveries.length - 1]?.description}
					</p>
				</div>
			)}

			<div className="mt-3 flex flex-wrap gap-2">
				{isProvider && status === "funded" && (
					<button
						className={primaryButtonClass()}
						disabled={isPending}
						type="button"
						onClick={(): void => {
							accept.mutate({ actor, escrowId });
						}}
					>
						Accept job
					</button>
				)}

				{isProvider &&
					(status === "accepted" || status === "revision_requested") && (
						<button
							className={primaryButtonClass()}
							disabled={isPending}
							type="button"
							onClick={(): void => {
								toggle("deliver");
							}}
						>
							Deliver work
						</button>
					)}

				{isProvider && status === "accepted" && (
					<button
						className={secondary}
						disabled={isPending}
						type="button"
						onClick={(): void => {
							toggle("extend");
						}}
					>
						Request extension
					</button>
				)}

				{isClient && status === "accepted" && hasPendingExtension && (
					<button
						className={secondary}
						disabled={isPending}
						type="button"
						onClick={(): void => {
							approveExtension.mutate({ actor, escrowId });
						}}
					>
						Approve extension
					</button>
				)}

				{isClient && status === "delivered" && (
					<button
						className={primaryButtonClass()}
						disabled={isPending}
						type="button"
						onClick={(): void => {
							acceptDelivery.mutate({ actor, escrowId });
						}}
					>
						Accept delivery
					</button>
				)}

				{isClient && status === "delivered" && (
					<button
						className={secondary}
						disabled={isPending}
						type="button"
						onClick={(): void => {
							toggle("revision");
						}}
					>
						Request revision
					</button>
				)}

				{status === "delivered" && (
					<button
						className={secondary}
						disabled={isPending}
						type="button"
						onClick={(): void => {
							toggle("dispute");
						}}
					>
						Open dispute
					</button>
				)}

				{isClient && (status === "funded" || status === "accepted") && (
					<button
						className={secondary}
						disabled={isPending}
						type="button"
						onClick={(): void => {
							cancel.mutate({ actor, escrowId });
						}}
					>
						Cancel
					</button>
				)}

				{isProvider && (status === "settled" || status === "resolved") && (
					<button
						className={primaryButtonClass()}
						disabled={isPending}
						type="button"
						onClick={(): void => {
							release.mutate({ actor, escrowId });
						}}
					>
						Claim release
					</button>
				)}

				{isClient &&
					(status === "cancelled" ||
						status === "expired" ||
						status === "resolved") && (
						<button
							className={secondary}
							disabled={isPending}
							type="button"
							onClick={(): void => {
								refund.mutate({ actor, escrowId });
							}}
						>
							Claim refund
						</button>
					)}
			</div>

			{openAction && (
				<div className="mt-3 space-y-2">
					{openAction === "extend" ? (
						<div>
							<label className={labelClass(isDark)}>New deadline</label>
							<input
								type="datetime-local"
								value={deadline}
								className={`w-full rounded-md border px-2.5 py-1.5 text-xs ${
									isDark
										? "border-neutral-700 bg-neutral-900 text-white"
										: "border-neutral-300 bg-white text-black"
								}`}
								onChange={(event): void => {
									setDeadline(event.target.value);
								}}
							/>
						</div>
					) : (
						<textarea
							rows={2}
							value={text}
							className={`min-h-[56px] w-full resize-none rounded-md border px-2.5 py-1.5 text-xs ${
								isDark
									? "border-neutral-700 bg-neutral-900 text-white placeholder-neutral-600"
									: "border-neutral-300 bg-white text-black placeholder-neutral-400"
							}`}
							placeholder={
								openAction === "deliver"
									? "Describe what you delivered and where to find it..."
									: openAction === "revision"
										? "What needs to change?"
										: "Why are you opening a dispute?"
							}
							onChange={(event): void => {
								setText(event.target.value);
							}}
						/>
					)}
					<div className="flex gap-2">
						<button
							className={primaryButtonClass()}
							type="button"
							disabled={
								isPending ||
								(openAction === "extend" ? !deadline : !text.trim())
							}
							onClick={submitText}
						>
							Submit
						</button>
						<button
							className={secondary}
							disabled={isPending}
							type="button"
							onClick={resetForm}
						>
							Cancel
						</button>
					</div>
				</div>
			)}

			{actionError && (
				<p className="mt-2 text-xs text-red-500">
					{errorMessage(actionError, "Action failed")}
				</p>
			)}
		</div>
	);
};
