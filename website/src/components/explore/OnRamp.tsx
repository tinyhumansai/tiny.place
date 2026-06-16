"use client";

import { MoonPaySellWidget } from "@moonpay/moonpay-react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import type { FunctionComponent } from "@src/common/types";
import { buildDeBridgeFundUrl } from "@src/common/debridge";
import {
	buildMoonPayBuyUrl,
	MOONPAY_BASE_CURRENCY_CODE,
	MOONPAY_USDC_SOLANA_CURRENCY_CODE,
} from "@src/common/moonpay";
import { Chip } from "@src/components/ui/Chip";
import { useTabRoute } from "@src/hooks/use-tab-route";

const tabs = ["onramp", "offramp"] as const;

type Tab = (typeof tabs)[number];

const tabLabels: Record<Tab, string> = {
	onramp: "On-ramp",
	offramp: "Off-ramp",
};

// On-ramp funding methods: fiat card via MoonPay, or crypto bridge via deBridge.
const fundingMethods = ["card", "crypto"] as const;

type FundingMethod = (typeof fundingMethods)[number];

const fundingMethodLabels: Record<FundingMethod, string> = {
	card: "Credit / debit card",
	crypto: "Crypto",
};

// Accepts a positive decimal USD amount from the URL; anything else is ignored
// so a stray ?amount= value can't break the widget.
const sanitizeAmount = (raw: string | null): string | undefined => {
	if (raw === null) {
		return undefined;
	}
	const trimmed = raw.trim();
	if (!/^\d+(\.\d+)?$/.test(trimmed) || Number(trimmed) <= 0) {
		return undefined;
	}
	return trimmed;
};

type WidgetProperties = {
	isDark: boolean;
	walletAddress?: string;
};

type CardFundPanelProperties = WidgetProperties & {
	baseCurrencyAmount?: string;
};

// Funds the SOL wallet with USDC via a fiat card payment (fiat → USDC on
// Solana), redirecting to MoonPay's hosted widget.
const CardFundPanel = ({
	baseCurrencyAmount,
	isDark,
	walletAddress,
}: CardFundPanelProperties): FunctionComponent => (
	<div
		className={`space-y-3 rounded-lg border p-4 ${
			isDark
				? "border-neutral-800 bg-neutral-950"
				: "border-neutral-200 bg-neutral-50"
		}`}
	>
		<p
			className={`text-sm ${isDark ? "text-neutral-400" : "text-neutral-600"}`}
		>
			Pay with a credit or debit card through MoonPay. You complete the purchase
			on MoonPay&apos;s hosted page
			{baseCurrencyAmount === undefined
				? ""
				: ` (prefilled to $${baseCurrencyAmount})`}
			; USDC settles straight to your Solana wallet.
		</p>
		<a
			href={buildMoonPayBuyUrl({ walletAddress, baseCurrencyAmount })}
			rel="noreferrer"
			target="_blank"
			className={`inline-flex items-center rounded-md px-4 py-2 text-sm font-medium transition-colors ${
				isDark
					? "bg-white text-black hover:bg-neutral-200"
					: "bg-black text-white hover:bg-neutral-800"
			}`}
		>
			Fund with card on MoonPay →
		</a>
	</div>
);

// Funds the SOL wallet with USDC by bridging crypto from another chain via
// deBridge. We can only build the link once we know the destination wallet.
const CryptoFundPanel = ({
	isDark,
	walletAddress,
}: WidgetProperties): FunctionComponent => {
	if (walletAddress === undefined) {
		return (
			<p
				className={`rounded-lg border p-3 text-sm ${
					isDark
						? "border-neutral-800 bg-neutral-950 text-neutral-400"
						: "border-neutral-200 bg-neutral-50 text-neutral-500"
				}`}
			>
				Connect your wallet, or open this page with a <code>?wallet=</code>{" "}
				address, to fund it with crypto.
			</p>
		);
	}

	return (
		<div
			className={`space-y-3 rounded-lg border p-4 ${
				isDark
					? "border-neutral-800 bg-neutral-950"
					: "border-neutral-200 bg-neutral-50"
			}`}
		>
			<p
				className={`text-sm ${isDark ? "text-neutral-400" : "text-neutral-600"}`}
			>
				Already hold crypto on another chain? Bridge it into USDC on this Solana
				wallet through deBridge. You pick the source chain, token, and amount on
				deBridge; funds settle straight to your wallet.
			</p>
			<a
				href={buildDeBridgeFundUrl(walletAddress)}
				rel="noreferrer"
				target="_blank"
				className={`inline-flex items-center rounded-md px-4 py-2 text-sm font-medium transition-colors ${
					isDark
						? "bg-white text-black hover:bg-neutral-200"
						: "bg-black text-white hover:bg-neutral-800"
				}`}
			>
				Fund with crypto on deBridge →
			</a>
		</div>
	);
};

// Cashes USDC on Solana out to fiat, refunding to the connected SOL wallet.
const OffRampWidget = ({
	walletAddress,
}: WidgetProperties): FunctionComponent => (
	<MoonPaySellWidget
		visible
		baseCurrencyCode={MOONPAY_USDC_SOLANA_CURRENCY_CODE}
		quoteCurrencyCode={MOONPAY_BASE_CURRENCY_CODE}
		refundWalletAddress={walletAddress}
		variant="embedded"
	/>
);

type OnRampProperties = {
	isDark: boolean;
};

export const OnRamp = ({ isDark }: OnRampProperties): FunctionComponent => {
	const { publicKey } = useWallet();
	const searchParameters = useSearchParams();
	const { activeTab, setTab } = useTabRoute<Tab>(tabs, "onramp");
	const [fundingMethod, setFundingMethod] = useState<FundingMethod>("card");

	// A `?wallet=` URL param (e.g. an agent funding link) targets a specific
	// wallet and takes precedence over the connected one; otherwise we use the
	// connected wallet, if any.
	const walletParameter = searchParameters.get("wallet")?.trim();
	const walletAddress =
		walletParameter !== undefined && walletParameter !== ""
			? walletParameter
			: publicKey?.toBase58();
	const amount = sanitizeAmount(searchParameters.get("amount"));

	return (
		<div className="space-y-3">
			<div>
				<h2
					className={`text-lg font-bold ${isDark ? "text-white" : "text-black"}`}
				>
					On-ramp / Off-ramp
				</h2>
				<p
					className={`mt-1 text-sm ${isDark ? "text-neutral-400" : "text-neutral-500"}`}
				>
					Fund or cash out your Solana wallet — pay by card via MoonPay, or
					bridge crypto in via deBridge.
				</p>
			</div>

			{walletAddress !== undefined ? (
				<p
					className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
				>
					Wallet: {walletAddress}
				</p>
			) : (
				<p
					className={`rounded-lg border p-3 text-sm ${
						isDark
							? "border-neutral-800 bg-neutral-950 text-neutral-400"
							: "border-neutral-200 bg-neutral-50 text-neutral-500"
					}`}
				>
					Connect your wallet to prefill the destination address. You can also
					enter one on MoonPay after you continue.
				</p>
			)}

			<div className="flex gap-1">
				{tabs.map((tab) => (
					<Chip
						key={tab}
						active={activeTab === tab}
						isDark={isDark}
						onClick={(): void => {
							setTab(tab);
						}}
					>
						{tabLabels[tab]}
					</Chip>
				))}
			</div>

			{activeTab === "onramp" ? (
				<div className="space-y-3">
					<div className="flex gap-1">
						{fundingMethods.map((method) => (
							<Chip
								key={method}
								active={fundingMethod === method}
								isDark={isDark}
								shape="pill"
								onClick={(): void => {
									setFundingMethod(method);
								}}
							>
								{fundingMethodLabels[method]}
							</Chip>
						))}
					</div>
					{fundingMethod === "card" ? (
						<CardFundPanel
							baseCurrencyAmount={amount}
							isDark={isDark}
							walletAddress={walletAddress}
						/>
					) : (
						<CryptoFundPanel isDark={isDark} walletAddress={walletAddress} />
					)}
				</div>
			) : (
				<OffRampWidget isDark={isDark} walletAddress={walletAddress} />
			)}
		</div>
	);
};
