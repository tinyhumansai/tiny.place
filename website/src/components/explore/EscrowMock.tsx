"use client";

import { useState, type FormEvent } from "react";
import type { Escrow, TinyVerseError } from "@tinyhumansai/tinyplace";

import type { FunctionComponent } from "@src/common/types";
import {
	useAcceptEscrow,
	useCancelEscrow,
	useCreateEscrow,
	useDeliverEscrow,
	useEscrows,
} from "@src/hooks/use-escrow";
import {
	firstActiveIdentity,
	useOwnedIdentities,
} from "@src/hooks/use-marketplace";
import { useAuthStore } from "@src/store/auth";

type EscrowMockProperties = {
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
		const typed = error as TinyVerseError;
		if (
			typed.name === "TinyVerseError" &&
			typed.status === 402 &&
			typed.body &&
			typeof typed.body === "object"
		) {
			const body = typed.body as {
				error?: string;
				payment?: { amount?: string; asset?: string; network?: string };
			};
			if (body.payment) {
				return `${body.error ?? "Payment required"}: ${body.payment.amount ?? ""} ${body.payment.asset ?? ""} on ${body.payment.network ?? ""}`.trim();
			}
		}
		return error.message;
	}
	return "Escrow request failed";
}

function formatDate(value: string): string {
	return new Date(value).toLocaleString();
}

function EscrowCard({
	actor,
	escrow,
	isDark,
	onAccept,
	onCancel,
	onDeliver,
}: {
	actor: string;
	escrow: Escrow;
	isDark: boolean;
	onAccept: (escrowId: string) => void;
	onCancel: (escrowId: string) => void;
	onDeliver: (escrowId: string) => void;
}): React.ReactElement {
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
						{escrow.terms.description}
					</p>
					<p className="mt-1 text-xs text-neutral-500">
						{escrow.client} {"->"} {escrow.provider}
					</p>
				</div>
				<span
					className={`rounded-full px-2 py-0.5 text-xs ${
						isDark ? "bg-neutral-800 text-neutral-300" : "bg-neutral-200"
					}`}
				>
					{escrow.status}
				</span>
			</div>
			<div className="mt-3 grid grid-cols-3 gap-2 text-xs">
				<div>
					<p className="text-neutral-500">Amount</p>
					<p className={isDark ? "text-white" : "text-black"}>
						{escrow.amount} {escrow.asset}
					</p>
				</div>
				<div>
					<p className="text-neutral-500">Deadline</p>
					<p className={isDark ? "text-white" : "text-black"}>
						{formatDate(escrow.terms.deadline)}
					</p>
				</div>
				<div>
					<p className="text-neutral-500">Revisions</p>
					<p className={isDark ? "text-white" : "text-black"}>
						{escrow.revisionCount}/{escrow.terms.maxRevisions}
					</p>
				</div>
			</div>
			<div className="mt-3 flex flex-wrap gap-2">
				<button
					className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
					disabled={!actor || escrow.status !== "funded"}
					type="button"
					onClick={(): void => {
						onAccept(escrow.escrowId);
					}}
				>
					Accept
				</button>
				<button
					className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
					type="button"
					disabled={
						!actor ||
						(escrow.status !== "accepted" &&
							escrow.status !== "revision_requested")
					}
					onClick={(): void => {
						onDeliver(escrow.escrowId);
					}}
				>
					Deliver
				</button>
				<button
					disabled={!actor || escrow.status !== "funded"}
					type="button"
					className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
						isDark
							? "border-neutral-700 text-neutral-300"
							: "border-neutral-300 text-neutral-600"
					} disabled:opacity-50`}
					onClick={(): void => {
						onCancel(escrow.escrowId);
					}}
				>
					Cancel
				</button>
			</div>
		</div>
	);
}

export const EscrowMock = ({
	isDark,
}: EscrowMockProperties): FunctionComponent => {
	const agentId = useAuthStore((state) => state.agentId);
	const ownedIdentities = useOwnedIdentities(agentId);
	const escrowIdentity = firstActiveIdentity(ownedIdentities.data?.identities);
	const actor = escrowIdentity?.username ?? "";
	const { data, error, isError, isLoading } = useEscrows({ limit: 10 });
	const createEscrow = useCreateEscrow();
	const acceptEscrow = useAcceptEscrow();
	const cancelEscrow = useCancelEscrow();
	const deliverEscrow = useDeliverEscrow();
	const [provider, setProvider] = useState("");
	const [amount, setAmount] = useState("1000000");
	const [description, setDescription] = useState("Deliver a research report");
	const [deliveryDescription, setDeliveryDescription] = useState(
		"Completed deliverables are attached in the task thread."
	);
	const [deadline, setDeadline] = useState("");
	const escrows = data?.escrows ?? [];
	const mutationError =
		createEscrow.error ??
		acceptEscrow.error ??
		cancelEscrow.error ??
		deliverEscrow.error;

	const handleCreate = (event: FormEvent): void => {
		event.preventDefault();
		if (!actor || !provider || !deadline) {
			return;
		}
		createEscrow.mutate({
			client: actor,
			clientCryptoId: agentId,
			provider,
			amount,
			asset: "USDC",
			network: "eip155:8453",
			terms: {
				description,
				deadline: new Date(deadline).toISOString(),
				maxRevisions: 1,
				autoReleaseAfter: "12h",
			},
		});
	};

	return (
		<div className="space-y-4">
			<form className={panelClass(isDark)} onSubmit={handleCreate}>
				<div className="flex items-center justify-between gap-3">
					<h3
						className={`text-sm font-medium ${isDark ? "text-white" : "text-black"}`}
					>
						Create Escrow
					</h3>
					<span className="text-xs text-neutral-500">Signed funding flow</span>
				</div>
				{agentId ? (
					<p
						className={`mt-2 text-xs ${actor ? (isDark ? "text-neutral-500" : "text-neutral-400") : "text-red-500"}`}
					>
						{actor
							? `Client and action signer: ${actor}`
							: ownedIdentities.isLoading
								? "Checking your active handle..."
								: "Register an active handle before creating or acting on escrows."}
					</p>
				) : (
					<p className="mt-2 text-xs text-red-500">
						Connect your wallet to sign escrow requests.
					</p>
				)}
				<div className="mt-3 grid gap-3 md:grid-cols-2">
					<div>
						<label className={labelClass(isDark)}>Client handle</label>
						<p
							className={`mt-1 rounded-md border px-2.5 py-1.5 text-xs ${
								isDark
									? "border-neutral-700 bg-neutral-900 text-neutral-300"
									: "border-neutral-300 bg-white text-neutral-600"
							}`}
						>
							{actor || "Connect wallet"}
						</p>
					</div>
					<div>
						<label className={labelClass(isDark)}>Provider handle</label>
						<input
							className={`${inputClass(isDark)} w-full`}
							placeholder="@seller"
							type="text"
							value={provider}
							onChange={(event): void => {
								setProvider(event.target.value);
							}}
						/>
					</div>
					<div>
						<label className={labelClass(isDark)}>Amount (USDC units)</label>
						<input
							className={`${inputClass(isDark)} w-full`}
							min="1"
							type="number"
							value={amount}
							onChange={(event): void => {
								setAmount(event.target.value);
							}}
						/>
					</div>
					<div>
						<label className={labelClass(isDark)}>Deadline</label>
						<input
							className={`${inputClass(isDark)} w-full`}
							type="datetime-local"
							value={deadline}
							onChange={(event): void => {
								setDeadline(event.target.value);
							}}
						/>
					</div>
					<div className="md:col-span-2">
						<label className={labelClass(isDark)}>Terms</label>
						<textarea
							className={`${inputClass(isDark)} min-h-16 w-full resize-none`}
							value={description}
							onChange={(event): void => {
								setDescription(event.target.value);
							}}
						/>
					</div>
				</div>
				<button
					className="mt-3 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
					disabled={createEscrow.isPending || !actor || !provider || !deadline}
					type="submit"
				>
					{createEscrow.isPending ? "Creating..." : "Create Escrow"}
				</button>
			</form>

			<div className={panelClass(isDark)}>
				<div className="flex items-center justify-between gap-3">
					<h3
						className={`text-sm font-medium ${isDark ? "text-white" : "text-black"}`}
					>
						Live Escrows
					</h3>
					<span
						className={`text-xs ${actor ? (isDark ? "text-neutral-500" : "text-neutral-400") : "text-red-500"}`}
					>
						{actor || "Wallet identity required"}
					</span>
				</div>
				<div className="mt-3">
					<label className={labelClass(isDark)}>Delivery note</label>
					<input
						className={`${inputClass(isDark)} mt-1 w-full`}
						type="text"
						value={deliveryDescription}
						onChange={(event): void => {
							setDeliveryDescription(event.target.value);
						}}
					/>
				</div>
				{isLoading ? (
					<p className="mt-3 text-xs text-neutral-500">Loading escrows...</p>
				) : null}
				{isError ? (
					<p className="mt-3 text-xs text-red-500">{errorMessage(error)}</p>
				) : null}
				{mutationError ? (
					<p className="mt-3 text-xs text-red-500">
						{errorMessage(mutationError)}
					</p>
				) : null}
				{!isLoading && !isError && escrows.length === 0 ? (
					<p className="mt-3 text-xs text-neutral-500">No escrows found.</p>
				) : null}
				<div className="mt-3 space-y-3">
					{escrows.map((escrow) => (
						<EscrowCard
							key={escrow.escrowId}
							actor={actor}
							escrow={escrow}
							isDark={isDark}
							onAccept={(escrowId): void => {
								acceptEscrow.mutate({ actor, escrowId });
							}}
							onCancel={(escrowId): void => {
								cancelEscrow.mutate({ actor, escrowId });
							}}
							onDeliver={(escrowId): void => {
								deliverEscrow.mutate({
									actor,
									description: deliveryDescription,
									escrowId,
								});
							}}
						/>
					))}
				</div>
			</div>
		</div>
	);
};
