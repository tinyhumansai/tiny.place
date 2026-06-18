"use client";

import { useCallback, useState } from "react";

import { formatTokenAmount } from "@src/common/format-amount";
import type { FunctionComponent } from "@src/common/types";

import {
	X402ConfirmContext,
	type X402ConfirmContextValue,
	type X402ConfirmRequest,
} from "./x402-confirm";

type RunStatus = "idle" | "running" | "error" | "done";

type DialogProperties = {
	error: string | null;
	isDark: boolean;
	onCancel: () => void;
	onConfirm: () => void;
	onDone: () => void;
	request: X402ConfirmRequest;
	status: RunStatus;
};

function X402Dialog({
	error,
	isDark,
	onCancel,
	onConfirm,
	onDone,
	request,
	status,
}: DialogProperties): FunctionComponent {
	const panelClass = isDark
		? "border-neutral-800 bg-neutral-950 text-white"
		: "border-neutral-200 bg-white text-black";
	const mutedClass = isDark ? "text-neutral-400" : "text-neutral-500";
	const running = status === "running";
	const done = status === "done";

	return (
		<div
			aria-modal="true"
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
			role="dialog"
		>
			<div
				className={`w-full max-w-sm rounded-xl border p-5 shadow-xl ${panelClass}`}
			>
				<h3 className="text-sm font-semibold">{request.title}</h3>
				<p className={`mt-1 text-xs ${mutedClass}`}>
					Review this payment before it is authorized.
				</p>

				<dl className="theme-detail-list mt-4 rounded-lg border">
					<div className="flex items-center justify-between px-3 py-2">
						<dt className={`text-xs ${mutedClass}`}>Identity</dt>
						<dd className="text-xs font-medium">{request.subject}</dd>
					</div>
					{request.amount && (
						<div className="flex items-center justify-between px-3 py-2">
							<dt className={`text-xs ${mutedClass}`}>Amount</dt>
							<dd className="text-xs font-semibold">
								{formatTokenAmount(request.amount, request.asset)}
							</dd>
						</div>
					)}
					{request.recipient && (
						<div className="flex items-center justify-between gap-2 px-3 py-2">
							<dt className={`text-xs ${mutedClass}`}>To</dt>
							<dd className="truncate text-xs font-medium">
								{request.recipient}
							</dd>
						</div>
					)}
				</dl>

				{request.note && (
					<p className={`mt-3 text-xs ${mutedClass}`}>{request.note}</p>
				)}
				{error && <p className="mt-3 text-xs text-rose-500">{error}</p>}
				{done && (
					<p className="mt-3 text-xs text-emerald-500">Payment confirmed.</p>
				)}

				<div className="mt-5 flex justify-end gap-2">
					{done ? (
						<button
							className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-500"
							type="button"
							onClick={onDone}
						>
							Done
						</button>
					) : (
						<>
							<button
								disabled={running}
								type="button"
								className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
									isDark
										? "border-neutral-700 text-neutral-200 hover:bg-neutral-800"
										: "border-neutral-300 text-neutral-700 hover:bg-neutral-100"
								}`}
								onClick={onCancel}
							>
								Cancel
							</button>
							<button
								className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
								disabled={running}
								type="button"
								onClick={onConfirm}
							>
								{running
									? "Confirming…"
									: error
										? "Retry"
										: (request.confirmLabel ?? "Confirm")}
							</button>
						</>
					)}
				</div>
			</div>
		</div>
	);
}

type Pending = X402ConfirmRequest & {
	execute: () => Promise<unknown>;
	reject: (error: unknown) => void;
	resolve: (value: unknown) => void;
};

type ProviderProperties = {
	children: React.ReactNode;
	isDark: boolean;
};

// Provides useX402Confirm() to its subtree and renders a single shared dialog:
// every paid (x402) action confirms here, showing what will happen + the cost,
// then runs on confirm with inline pending/success/error.
export const X402ConfirmProvider = ({
	children,
	isDark,
}: ProviderProperties): FunctionComponent => {
	const [pending, setPending] = useState<Pending | null>(null);
	const [status, setStatus] = useState<RunStatus>("idle");
	const [error, setError] = useState<string | null>(null);

	const confirm = useCallback<X402ConfirmContextValue["confirm"]>(
		(request, execute) => {
			return new Promise<unknown>((resolve, reject) => {
				setPending({ ...request, execute, reject, resolve });
				setStatus("idle");
				setError(null);
			});
		},
		[]
	);

	const close = useCallback((): void => {
		pending?.reject(new Error("Payment confirmation cancelled."));
		setPending(null);
		setStatus("idle");
		setError(null);
	}, [pending]);

	const run = useCallback(async (): Promise<void> => {
		if (!pending) {
			return;
		}
		setStatus("running");
		setError(null);
		try {
			const result = await pending.execute();
			pending.resolve(result);
			setStatus("done");
		} catch (caught) {
			setStatus("error");
			setError(
				caught instanceof Error ? caught.message : "Payment failed. Try again."
			);
		}
	}, [pending]);

	return (
		<X402ConfirmContext.Provider value={{ confirm }}>
			{children}
			{pending && (
				<X402Dialog
					error={error}
					isDark={isDark}
					request={pending}
					status={status}
					onCancel={close}
					onConfirm={run}
					onDone={close}
				/>
			)}
		</X402ConfirmContext.Provider>
	);
};
