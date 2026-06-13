"use client";

import { useMemo, useState } from "react";
import {
	generateNonce,
	signX402Authorization,
	type X402VerifyRequest,
} from "@tinyhumansai/tinyplace";

import type { FunctionComponent } from "@src/common/types";
import {
	useSettlePayment,
	useSupportedPayments,
	useVerifyPayment,
} from "@src/hooks/use-payments";
import { useAuthStore } from "@src/store/auth";

type PaymentsProperties = {
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

function resultText(value: unknown): string {
	return JSON.stringify(value, null, 2);
}

function errorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return "Payment request failed.";
}

function ResultPanel({
	error,
	isDark,
	title,
	value,
}: {
	error?: unknown;
	isDark: boolean;
	title: string;
	value: unknown;
}): React.ReactElement | null {
	if (!value && !error) {
		return null;
	}
	return (
		<div
			className={`rounded-md border p-3 ${
				isDark
					? "border-neutral-800 bg-neutral-900"
					: "border-neutral-200 bg-white"
			}`}
		>
			<p
				className={`mb-2 text-xs font-medium ${error ? "text-red-500" : isDark ? "text-white" : "text-black"}`}
			>
				{title}
			</p>
			<pre
				className={`max-h-56 overflow-auto whitespace-pre-wrap break-words text-xs ${
					error
						? "text-red-500"
						: isDark
							? "text-neutral-300"
							: "text-neutral-700"
				}`}
			>
				{error ? errorMessage(error) : resultText(value)}
			</pre>
		</div>
	);
}

export const Payments = ({
	isDark,
}: PaymentsProperties): FunctionComponent => {
	const signer = useAuthStore((state) => state.signer);
	const agentId = useAuthStore((state) => state.agentId);
	const supportedPayments = useSupportedPayments();
	const verifyPayment = useVerifyPayment();
	const settlePayment = useSettlePayment();
	const firstChain = supportedPayments.data?.chains[0];
	const firstAsset = firstChain?.assets[0];
	const [network, setNetwork] = useState(firstChain?.network ?? "eip155:8453");
	const [asset, setAsset] = useState(firstAsset?.symbol ?? "USDC");
	const [amount, setAmount] = useState("1");
	const [payee, setPayee] = useState("@provider");
	const [referenceId, setReferenceId] = useState("payment-console");

	const availableAssets = useMemo((): Array<string> => {
		const chain = supportedPayments.data?.chains.find(
			(candidate) => candidate.network === network
		);
		return (
			chain?.assets.map((supportedAsset) => supportedAsset.symbol) ?? [asset]
		);
	}, [asset, network, supportedPayments.data?.chains]);

	const buildPayment = async (): Promise<X402VerifyRequest> => {
		if (!signer || !agentId) {
			throw new Error("Connect your wallet first");
		}
		const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
		return signX402Authorization(signer, {
			scheme: "exact",
			network,
			asset,
			amount,
			from: agentId,
			to: payee.trim(),
			nonce: generateNonce("payment"),
			expiresAt,
			metadata: {
				source: "website",
				reference: referenceId.trim() || "payment-console",
			},
		});
	};

	const handleVerify = async (): Promise<void> => {
		const payment = await buildPayment();
		verifyPayment.mutate(payment);
	};

	const handleSettle = async (): Promise<void> => {
		const payment = await buildPayment();
		settlePayment.mutate({
			payment,
			reference: {
				kind: "website-payment-console",
				id: referenceId.trim() || "payment-console",
			},
		});
	};

	return (
		<div className="space-y-4">
			<div className={panelClass(isDark)}>
				<div className="flex items-center justify-between gap-3">
					<h3
						className={`text-sm font-medium ${isDark ? "text-white" : "text-black"}`}
					>
						Supported Payment Networks
					</h3>
					<span
						className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
					>
						Live from staging
					</span>
				</div>
				{supportedPayments.isLoading ? (
					<p className="mt-2 text-xs text-neutral-500">Loading networks...</p>
				) : null}
				{supportedPayments.isError ? (
					<p className="mt-2 text-xs text-red-500">
						{errorMessage(supportedPayments.error)}
					</p>
				) : null}
				<div className="mt-3 grid gap-2 md:grid-cols-2">
					{(supportedPayments.data?.chains ?? []).map((chain) => (
						<div
							key={chain.network}
							className={`rounded-md border p-2 ${
								isDark
									? "border-neutral-800 bg-neutral-900"
									: "border-neutral-200 bg-white"
							}`}
						>
							<div className="flex items-center justify-between gap-2">
								<span
									className={`text-xs font-medium ${isDark ? "text-white" : "text-black"}`}
								>
									{chain.name}
								</span>
								<span
									className={`rounded-full px-1.5 py-0.5 text-xs ${
										isDark
											? "bg-neutral-800 text-neutral-400"
											: "bg-neutral-100 text-neutral-500"
									}`}
								>
									{chain.kind}
								</span>
							</div>
							<p
								className={`mt-1 break-all text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
							>
								{chain.network}
							</p>
							<div className="mt-2 flex flex-wrap gap-1">
								{chain.assets.map((supportedAsset) => (
									<span
										key={`${chain.network}-${supportedAsset.symbol}`}
										className={`rounded-full px-1.5 py-0.5 text-xs ${
											isDark
												? "bg-neutral-800 text-neutral-300"
												: "bg-neutral-100 text-neutral-600"
										}`}
									>
										{supportedAsset.symbol}
									</span>
								))}
							</div>
						</div>
					))}
				</div>
			</div>

			<div className={panelClass(isDark)}>
				<h3
					className={`mb-3 text-sm font-medium ${isDark ? "text-white" : "text-black"}`}
				>
					x402 Verify / Settle
				</h3>
				{!agentId ? (
					<p className="mb-3 text-xs text-neutral-500">
						Connect your wallet to sign an x402 payment payload.
					</p>
				) : null}
				<div className="grid gap-3 md:grid-cols-2">
					<div>
						<label className={labelClass(isDark)}>Network</label>
						<select
							className={`${inputClass(isDark)} w-full`}
							value={network}
							onChange={(event): void => {
								setNetwork(event.target.value);
							}}
						>
							{(supportedPayments.data?.chains ?? []).map((chain) => (
								<option key={chain.network} value={chain.network}>
									{chain.name}
								</option>
							))}
							<option value={network}>{network}</option>
						</select>
					</div>
					<div>
						<label className={labelClass(isDark)}>Asset</label>
						<select
							className={`${inputClass(isDark)} w-full`}
							value={asset}
							onChange={(event): void => {
								setAsset(event.target.value);
							}}
						>
							{availableAssets.map((supportedAsset) => (
								<option key={supportedAsset} value={supportedAsset}>
									{supportedAsset}
								</option>
							))}
						</select>
					</div>
					<div>
						<label className={labelClass(isDark)}>Amount</label>
						<input
							className={`${inputClass(isDark)} w-full`}
							type="text"
							value={amount}
							onChange={(event): void => {
								setAmount(event.target.value);
							}}
						/>
					</div>
					<div>
						<label className={labelClass(isDark)}>Payee</label>
						<input
							className={`${inputClass(isDark)} w-full`}
							type="text"
							value={payee}
							onChange={(event): void => {
								setPayee(event.target.value);
							}}
						/>
					</div>
					<div className="md:col-span-2">
						<label className={labelClass(isDark)}>Reference</label>
						<input
							className={`${inputClass(isDark)} w-full`}
							type="text"
							value={referenceId}
							onChange={(event): void => {
								setReferenceId(event.target.value);
							}}
						/>
					</div>
				</div>
				<div className="mt-3 flex flex-wrap gap-2">
					<button
						disabled={!agentId || verifyPayment.isPending}
						type="button"
						className={`rounded-md px-3 py-1.5 text-xs font-medium ${
							isDark
								? "bg-white text-black disabled:bg-neutral-800 disabled:text-neutral-500"
								: "bg-black text-white disabled:bg-neutral-200 disabled:text-neutral-500"
						}`}
						onClick={(): void => {
							void handleVerify();
						}}
					>
						{verifyPayment.isPending ? "Verifying..." : "Verify Payment"}
					</button>
					<button
						disabled={!agentId || settlePayment.isPending}
						type="button"
						className={`rounded-md px-3 py-1.5 text-xs font-medium ${
							isDark
								? "border border-neutral-700 text-neutral-200 disabled:text-neutral-600"
								: "border border-neutral-300 text-neutral-700 disabled:text-neutral-400"
						}`}
						onClick={(): void => {
							void handleSettle();
						}}
					>
						{settlePayment.isPending ? "Settling..." : "Settle Payment"}
					</button>
				</div>
			</div>

			<div className="grid gap-3 md:grid-cols-2">
				<ResultPanel
					error={verifyPayment.error}
					isDark={isDark}
					title="Verify Result"
					value={verifyPayment.data}
				/>
				<ResultPanel
					error={settlePayment.error}
					isDark={isDark}
					title="Settle Result"
					value={settlePayment.data}
				/>
			</div>
		</div>
	);
};
