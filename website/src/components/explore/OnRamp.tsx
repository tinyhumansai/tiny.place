"use client";

import { MoonPaySellWidget } from "@moonpay/moonpay-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

import type { FunctionComponent } from "@src/common/types";
import {
	buildDeBridgeFundUrl,
	SOL_NATIVE_SOLANA,
	USDC_SOLANA_MINT,
} from "@src/common/debridge";
import {
	buildMoonPayBuyUrl,
	MOONPAY_BASE_CURRENCY_CODE,
	MOONPAY_SOL_CURRENCY_CODE,
	MOONPAY_USDC_SOLANA_CURRENCY_CODE,
} from "@src/common/moonpay";
import { normalizeSolanaAddress } from "@src/common/solana-address";
import { useTinyplaceWallet } from "@src/common/tinyplace-wallet";
import { Chip } from "@src/components/ui/Chip";
import { useTabRoute } from "@src/hooks/use-tab-route";

const tabs = ["onramp", "offramp"] as const;

type Tab = (typeof tabs)[number];

const tabLabel = (t: TFunction, tab: Tab): string =>
	tab === "onramp" ? t("onRamp.tabOnramp") : t("onRamp.tabOfframp");

// On-ramp funding methods: fiat card via MoonPay, or crypto bridge via deBridge.
const fundingMethods = ["card", "crypto"] as const;

type FundingMethod = (typeof fundingMethods)[number];

const fundingMethodLabel = (t: TFunction, method: FundingMethod): string =>
	method === "card"
		? t("onRamp.fundingMethodCard")
		: t("onRamp.fundingMethodCrypto");

// The wallet can be funded with native SOL or with USDC on Solana. A `?asset=`
// URL param (sent by the CLI's fund link) preselects which one.
const fundAssets = ["SOL", "USDC"] as const;

type FundAsset = (typeof fundAssets)[number];

const fundAssetLabels: Record<FundAsset, string> = {
	SOL: "SOL",
	USDC: "USDC",
};

// Maps the chosen asset to the MoonPay currency code and deBridge output token
// that settle into it on the user's Solana wallet.
const moonPayCurrencyCode = (asset: FundAsset): string =>
	asset === "SOL"
		? MOONPAY_SOL_CURRENCY_CODE
		: MOONPAY_USDC_SOLANA_CURRENCY_CODE;

const deBridgeOutputCurrency = (asset: FundAsset): string =>
	asset === "SOL" ? SOL_NATIVE_SOLANA : USDC_SOLANA_MINT;

// Accepts a `?asset=` value case-insensitively; anything unrecognized is
// ignored so the default asset is used.
const parseAsset = (raw: string | null): FundAsset | undefined => {
	const upper = raw?.trim().toUpperCase();
	return fundAssets.find((asset) => asset === upper);
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
	asset: FundAsset;
};

type CardFundPanelProperties = WidgetProperties & {
	baseCurrencyAmount?: string;
};

// Funds the SOL wallet with the chosen asset via a fiat card payment (fiat →
// SOL or USDC on Solana), redirecting to MoonPay's hosted widget.
const CardFundPanel = ({
	asset,
	baseCurrencyAmount,
	isDark,
	walletAddress,
}: CardFundPanelProperties): FunctionComponent => {
	const { t } = useTranslation();
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
				{baseCurrencyAmount === undefined
					? t("onRamp.cardDescription", { asset })
					: t("onRamp.cardDescriptionPrefilled", {
							amount: baseCurrencyAmount,
							asset,
						})}
			</p>
			<a
				rel="noreferrer"
				target="_blank"
				className={`inline-flex items-center rounded-md px-4 py-2 text-sm font-medium transition-colors ${
					isDark
						? "bg-white text-black hover:bg-neutral-200"
						: "bg-black text-white hover:bg-neutral-800"
				}`}
				href={buildMoonPayBuyUrl({
					walletAddress,
					baseCurrencyAmount,
					currencyCode: moonPayCurrencyCode(asset),
				})}
			>
				{t("onRamp.fundWithCard")}
			</a>
		</div>
	);
};

// Funds the SOL wallet with the chosen asset by bridging crypto from another
// chain via deBridge. We can only build the link once we know the destination
// wallet.
const CryptoFundPanel = ({
	asset,
	isDark,
	walletAddress,
}: WidgetProperties): FunctionComponent => {
	const { t } = useTranslation();
	if (walletAddress === undefined) {
		return (
			<p
				className={`rounded-lg border p-3 text-sm ${
					isDark
						? "border-neutral-800 bg-neutral-950 text-neutral-400"
						: "border-neutral-200 bg-neutral-50 text-neutral-500"
				}`}
			>
				{t("onRamp.cryptoConnectPrefix")} <code>?address=</code>{" "}
				{t("onRamp.cryptoConnectSuffix")}
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
				{t("onRamp.cryptoDescription", { asset })}
			</p>
			<a
				rel="noreferrer"
				target="_blank"
				className={`inline-flex items-center rounded-md px-4 py-2 text-sm font-medium transition-colors ${
					isDark
						? "bg-white text-black hover:bg-neutral-200"
						: "bg-black text-white hover:bg-neutral-800"
				}`}
				href={buildDeBridgeFundUrl(
					walletAddress,
					deBridgeOutputCurrency(asset)
				)}
			>
				{t("onRamp.fundWithCrypto")}
			</a>
		</div>
	);
};

// Cashes the chosen asset on Solana out to fiat, refunding to the connected SOL
// wallet.
const OffRampWidget = ({
	asset,
	walletAddress,
}: WidgetProperties): FunctionComponent => (
	<MoonPaySellWidget
		visible
		baseCurrencyCode={moonPayCurrencyCode(asset)}
		quoteCurrencyCode={MOONPAY_BASE_CURRENCY_CODE}
		refundWalletAddress={walletAddress}
		variant="embedded"
	/>
);

type OnRampProperties = {
	isDark: boolean;
};

export const OnRamp = ({ isDark }: OnRampProperties): FunctionComponent => {
	const { t } = useTranslation();
	const { publicKey } = useTinyplaceWallet();
	const searchParameters = useSearchParams();
	const { activeTab, setTab } = useTabRoute<Tab>(tabs, "onramp");
	const [fundingMethod, setFundingMethod] = useState<FundingMethod>("card");

	// A funding link (e.g. the CLI's `/fund` link) targets a specific wallet via
	// `?address=` (or the legacy `?wallet=`) and takes precedence over the
	// connected one; otherwise we use the connected wallet, if any. The address
	// may arrive base58 or base64 — normalize it to the base58 form MoonPay and
	// deBridge require.
	const addressParameter =
		searchParameters.get("address") ?? searchParameters.get("wallet");
	const walletAddress =
		normalizeSolanaAddress(addressParameter) ?? publicKey?.toBase58();

	const amount = sanitizeAmount(searchParameters.get("amount"));

	// The asset to fund/cash out, preselected from `?asset=` (defaults to USDC).
	const [asset, setAsset] = useState<FundAsset>(
		parseAsset(searchParameters.get("asset")) ?? "USDC"
	);

	return (
		<div className="space-y-3">
			<div>
				<h2
					className={`text-lg font-bold ${isDark ? "text-white" : "text-black"}`}
				>
					{t("onRamp.title")}
				</h2>
				<p
					className={`mt-1 text-sm ${isDark ? "text-neutral-400" : "text-neutral-500"}`}
				>
					{t("onRamp.subtitle")}
				</p>
			</div>

			{walletAddress !== undefined ? (
				<p
					className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
				>
					{t("onRamp.walletLabel", { address: walletAddress })}
				</p>
			) : (
				<p
					className={`rounded-lg border p-3 text-sm ${
						isDark
							? "border-neutral-800 bg-neutral-950 text-neutral-400"
							: "border-neutral-200 bg-neutral-50 text-neutral-500"
					}`}
				>
					{t("onRamp.connectPrompt")}
				</p>
			)}

			<div className="space-y-1">
				<p
					className={`text-xs font-medium ${isDark ? "text-neutral-400" : "text-neutral-500"}`}
				>
					{t("onRamp.assetLabel")}
				</p>
				<div className="flex gap-1">
					{fundAssets.map((option) => (
						<Chip
							key={option}
							active={asset === option}
							isDark={isDark}
							shape="pill"
							onClick={(): void => {
								setAsset(option);
							}}
						>
							{fundAssetLabels[option]}
						</Chip>
					))}
				</div>
			</div>

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
						{tabLabel(t, tab)}
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
								{fundingMethodLabel(t, method)}
							</Chip>
						))}
					</div>
					{fundingMethod === "card" ? (
						<CardFundPanel
							asset={asset}
							baseCurrencyAmount={amount}
							isDark={isDark}
							walletAddress={walletAddress}
						/>
					) : (
						<CryptoFundPanel
							asset={asset}
							isDark={isDark}
							walletAddress={walletAddress}
						/>
					)}
				</div>
			) : (
				<OffRampWidget
					asset={asset}
					isDark={isDark}
					walletAddress={walletAddress}
				/>
			)}
		</div>
	);
};
