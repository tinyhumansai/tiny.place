"use client";

import { useState } from "react";

import type { FunctionComponent } from "@src/common/types";
import { useCreateEscrow } from "@src/hooks/use-escrow";

import {
	errorMessage,
	inputClass,
	labelClass,
	primaryButtonClass,
	selectClass,
	SOLANA_NETWORK,
} from "./shared";

const ASSETS = ["USDC", "SOL"] as const;

export const CreateEscrowForm = ({
	agentId,
	clientHandle,
	isDark,
}: {
	agentId: string;
	clientHandle: string;
	isDark: boolean;
}): FunctionComponent => {
	const createEscrow = useCreateEscrow();
	const [provider, setProvider] = useState("");
	const [amount, setAmount] = useState("");
	const [asset, setAsset] = useState<string>("USDC");
	const [description, setDescription] = useState("");
	const [deliverablesInput, setDeliverablesInput] = useState("");
	const [deadline, setDeadline] = useState("");
	const [maxRevisions, setMaxRevisions] = useState("2");

	const handleSubmit = (event: React.FormEvent): void => {
		event.preventDefault();
		if (!provider.trim() || !amount || !description.trim() || !deadline) {
			return;
		}
		const deliverables = deliverablesInput
			.split(",")
			.map((item) => item.trim())
			.filter(Boolean);
		const deadlineIso = new Date(deadline).toISOString();
		createEscrow.mutate(
			{
				client: clientHandle,
				clientCryptoId: agentId,
				provider: provider.trim(),
				amount,
				asset,
				network: SOLANA_NETWORK,
				terms: {
					description,
					deliverables: deliverables.length > 0 ? deliverables : undefined,
					deadline: deadlineIso,
					maxRevisions: Number.parseInt(maxRevisions, 10) || 0,
				},
			},
			{
				onSuccess: (): void => {
					setProvider("");
					setAmount("");
					setAsset("USDC");
					setDescription("");
					setDeliverablesInput("");
					setDeadline("");
					setMaxRevisions("2");
				},
			}
		);
	};

	return (
		<form
			className={`rounded-lg border p-4 ${
				isDark
					? "border-neutral-800 bg-neutral-950"
					: "border-neutral-200 bg-neutral-50"
			}`}
			onSubmit={handleSubmit}
		>
			<h3
				className={`mb-1 text-sm font-medium ${isDark ? "text-white" : "text-black"}`}
			>
				Hire for Work (Escrow)
			</h3>
			<p
				className={`mb-3 text-xs ${isDark ? "text-neutral-500" : "text-neutral-500"}`}
			>
				Funds are held in escrow and released when you accept the delivery.
				Hiring as {clientHandle}.
			</p>

			<div className="grid grid-cols-2 gap-3">
				<div className="col-span-2">
					<label className={labelClass(isDark)}>Provider (@handle)</label>
					<input
						required
						className={inputClass(isDark)}
						placeholder="@builder or wallet address"
						type="text"
						value={provider}
						onChange={(event): void => {
							setProvider(event.target.value);
						}}
					/>
				</div>

				<div>
					<label className={labelClass(isDark)}>Amount</label>
					<input
						required
						className={inputClass(isDark)}
						min="0"
						placeholder="100.00"
						step="0.000001"
						type="number"
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
						{ASSETS.map(
							(option): React.ReactElement => (
								<option key={option} value={option}>
									{option}
								</option>
							)
						)}
					</select>
				</div>

				<div className="col-span-2">
					<label className={labelClass(isDark)}>Scope of work</label>
					<textarea
						required
						className={`${inputClass(isDark)} min-h-[60px] resize-none`}
						placeholder="Describe the work to be delivered..."
						rows={2}
						value={description}
						onChange={(event): void => {
							setDescription(event.target.value);
						}}
					/>
				</div>

				<div className="col-span-2">
					<label className={labelClass(isDark)}>
						Deliverables (comma-separated)
					</label>
					<input
						className={inputClass(isDark)}
						placeholder="source code, docs, deployment"
						type="text"
						value={deliverablesInput}
						onChange={(event): void => {
							setDeliverablesInput(event.target.value);
						}}
					/>
				</div>

				<div>
					<label className={labelClass(isDark)}>Deadline</label>
					<input
						required
						className={inputClass(isDark)}
						type="datetime-local"
						value={deadline}
						onChange={(event): void => {
							setDeadline(event.target.value);
						}}
					/>
				</div>

				<div>
					<label className={labelClass(isDark)}>Max revisions</label>
					<input
						className={inputClass(isDark)}
						min="0"
						type="number"
						value={maxRevisions}
						onChange={(event): void => {
							setMaxRevisions(event.target.value);
						}}
					/>
				</div>
			</div>

			{createEscrow.isError && (
				<p className="mt-2 text-xs text-red-500">
					{errorMessage(createEscrow.error, "Failed to create escrow")}
				</p>
			)}

			{createEscrow.isSuccess && (
				<p className="mt-2 text-xs text-green-500">
					Work escrow created — track it in the Active tab.
				</p>
			)}

			<button
				className={`mt-3 w-full ${primaryButtonClass()}`}
				type="submit"
				disabled={
					createEscrow.isPending ||
					!provider.trim() ||
					!amount ||
					!description.trim() ||
					!deadline
				}
			>
				{createEscrow.isPending ? "Creating..." : "Fund Escrow & Hire"}
			</button>
		</form>
	);
};
