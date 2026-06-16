"use client";

import type { SignerApproval } from "@tinyhumansai/tinyplace";

import type { FunctionComponent } from "@src/common/types";
import { useApprovedSigners, useRevokeSigner } from "@src/hooks/use-signers";
import { useAuthStore } from "@src/store/auth";

function shortKey(value: string): string {
	if (value.length <= 18) {
		return value;
	}
	return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

function formatDate(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return value;
	}
	return date.toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function SignerRow({
	approval,
	isDark,
	onRevoke,
	revokePending,
}: {
	approval: SignerApproval;
	isDark: boolean;
	onRevoke: (signerKey: string) => void;
	revokePending: boolean;
}): React.ReactElement {
	const secondaryClass = isDark ? "text-neutral-500" : "text-neutral-500";
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
						className={`font-mono text-xs ${isDark ? "text-white" : "text-black"}`}
					>
						{shortKey(approval.signerKey)}
					</p>
					<p className={`mt-1 text-xs ${secondaryClass}`}>
						{approval.network} / {approval.asset}
					</p>
				</div>
				<span
					className={`rounded-md px-2 py-1 text-[10px] font-medium ${
						approval.status === "active"
							? "bg-emerald-500/10 text-emerald-500"
							: isDark
								? "bg-neutral-900 text-neutral-400"
								: "bg-neutral-200 text-neutral-600"
					}`}
				>
					{approval.status}
				</span>
			</div>
			<div
				className={`mt-3 grid grid-cols-4 gap-2 text-[10px] ${secondaryClass}`}
			>
				<div>
					<p>Budget</p>
					<p className={isDark ? "text-neutral-300" : "text-neutral-700"}>
						{approval.budget}
					</p>
				</div>
				<div>
					<p>Spent</p>
					<p className={isDark ? "text-neutral-300" : "text-neutral-700"}>
						{approval.spent}
					</p>
				</div>
				<div>
					<p>Remaining</p>
					<p className={isDark ? "text-neutral-300" : "text-neutral-700"}>
						{approval.remaining}
					</p>
				</div>
				<div>
					<p>Expires</p>
					<p className={isDark ? "text-neutral-300" : "text-neutral-700"}>
						{formatDate(approval.expiresAt)}
					</p>
				</div>
			</div>
			<div className="mt-3 flex items-center justify-between gap-2">
				<p className={`truncate text-[10px] ${secondaryClass}`}>
					Nonce {approval.nonce}
				</p>
				<button
					disabled={revokePending || approval.status !== "active"}
					type="button"
					className={`rounded-md px-2 py-1 text-[10px] font-medium ${
						isDark
							? "bg-red-500/10 text-red-400 disabled:text-neutral-600"
							: "bg-red-50 text-red-600 disabled:text-neutral-400"
					}`}
					onClick={(): void => {
						onRevoke(approval.signerKey);
					}}
				>
					Revoke
				</button>
			</div>
		</div>
	);
}

export const Signers = ({ isDark }: { isDark: boolean }): FunctionComponent => {
	const agentId = useAuthStore((state) => state.agentId);
	const signers = useApprovedSigners();
	const revokeSigner = useRevokeSigner();

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
					Connect your wallet to manage approved signers.
				</p>
			</div>
		);
	}

	const approvals = signers.data?.signers ?? [];

	return (
		<div className="space-y-4">
			<div
				className={`rounded-lg border p-4 ${
					isDark
						? "border-neutral-800 bg-neutral-950"
						: "border-neutral-200 bg-neutral-50"
				}`}
			>
				<div className="flex items-start justify-between gap-3">
					<div>
						<h3
							className={`text-sm font-medium ${isDark ? "text-white" : "text-black"}`}
						>
							Approved Wallet Signers
						</h3>
						<p
							className={`mt-1 text-xs ${isDark ? "text-neutral-500" : "text-neutral-500"}`}
						>
							Session keys that can authorize payments against a signed budget.
						</p>
					</div>
					<span
						className={`rounded-md px-2 py-1 text-xs ${
							isDark
								? "bg-neutral-900 text-neutral-400"
								: "bg-neutral-100 text-neutral-500"
						}`}
					>
						{approvals.length}
					</span>
				</div>
			</div>

			{signers.isLoading && (
				<p
					className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-500"}`}
				>
					Loading signers...
				</p>
			)}
			{signers.isError && (
				<p className="text-xs text-red-500">Failed to load approved signers.</p>
			)}
			{revokeSigner.isError && (
				<p className="text-xs text-red-500">{revokeSigner.error.message}</p>
			)}
			{!signers.isLoading && approvals.length === 0 && (
				<p
					className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-500"}`}
				>
					No approved signers found.
				</p>
			)}
			<div className="space-y-2">
				{approvals.map((approval) => (
					<SignerRow
						key={approval.signerKey}
						approval={approval}
						isDark={isDark}
						revokePending={revokeSigner.isPending}
						onRevoke={(signerKey): void => {
							revokeSigner.mutate(signerKey);
						}}
					/>
				))}
			</div>
		</div>
	);
};
