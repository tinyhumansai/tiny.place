"use client";

import { useTranslation } from "react-i18next";

import type { EscrowStatus, Product } from "@tinyhumansai/tinyplace";

import type { FunctionComponent } from "@src/common/types";
import {
	firstActiveIdentity,
	useOwnedIdentities,
	useProducts,
} from "@src/hooks/use-marketplace";
import { useAuthStore } from "@src/store/auth";

import { EscrowCard } from "./EscrowCard";
import { cardClass, mutedClass, strongClass } from "./shared";
import { escrowRole, useMyEscrows } from "./use-my-escrows";

const ACTIVE_STATUSES: Array<EscrowStatus> = [
	"funded",
	"accepted",
	"revision_requested",
];

const DELIVERED_STATUSES: Array<EscrowStatus> = [
	"delivered",
	"settled",
	"resolved",
	"cancelled",
	"expired",
];

function ConnectPrompt({ isDark }: { isDark: boolean }): React.ReactElement {
	const { t } = useTranslation();
	return (
		<div className={`${cardClass(isDark)} p-6 text-center`}>
			<p className={`text-sm ${mutedClass(isDark)}`}>
				{t("marketplace.work.connectPrompt")}
			</p>
		</div>
	);
}

function WorkList({
	emptyLabel,
	isDark,
	statuses,
}: {
	emptyLabel: string;
	isDark: boolean;
	statuses: Array<EscrowStatus>;
}): React.ReactElement {
	const { t } = useTranslation();
	const agentId = useAuthStore((state) => state.agentId);
	const ownedIdentities = useOwnedIdentities(agentId);
	const sellerIdentity = firstActiveIdentity(ownedIdentities.data?.identities);
	const actor = sellerIdentity?.username ?? agentId ?? "";
	const { escrows, isError, isLoading } = useMyEscrows(actor || undefined);

	const allowed = new Set(statuses);
	const filtered = escrows.filter((escrow) => allowed.has(escrow.status));

	if (isLoading) {
		return (
			<p className={`text-xs ${mutedClass(isDark)}`}>
				{t("marketplace.work.loading")}
			</p>
		);
	}
	if (isError) {
		return (
			<p className="text-xs text-red-500">{t("marketplace.work.loadError")}</p>
		);
	}
	if (filtered.length === 0) {
		return <p className={`text-xs ${mutedClass(isDark)}`}>{emptyLabel}</p>;
	}

	return (
		<div className="space-y-3">
			{filtered.map((escrow) => {
				const role = escrowRole(escrow, actor, agentId ?? undefined);
				if (!role) {
					return null;
				}
				return (
					<EscrowCard
						key={escrow.escrowId}
						actor={actor}
						escrow={escrow}
						isDark={isDark}
						role={role}
					/>
				);
			})}
		</div>
	);
}

function MyListings({
	isDark,
}: {
	isDark: boolean;
}): React.ReactElement | null {
	const { t } = useTranslation();
	const agentId = useAuthStore((state) => state.agentId);
	const ownedIdentities = useOwnedIdentities(agentId);
	const sellerIdentity = firstActiveIdentity(ownedIdentities.data?.identities);
	const me = sellerIdentity?.username ?? agentId;
	const { data } = useProducts();

	const mine = (data?.products ?? []).filter(
		(product: Product): boolean =>
			product.seller === me && product.status === "active"
	);

	if (mine.length === 0) {
		return null;
	}

	return (
		<div className="space-y-2">
			<h4 className={`text-xs font-medium ${strongClass(isDark)}`}>
				{t("marketplace.work.liveListings", { count: mine.length })}
			</h4>
			<div className="grid grid-cols-2 gap-2">
				{mine.map(
					(product: Product): React.ReactElement => (
						<div
							key={product.productId}
							className={`${cardClass(isDark)} flex items-center justify-between`}
						>
							<span className={`truncate text-xs ${strongClass(isDark)}`}>
								{product.name}
							</span>
							<span className={`text-[10px] ${mutedClass(isDark)}`}>
								{t("marketplace.work.sold", { count: product.salesCount })}
							</span>
						</div>
					)
				)}
			</div>
		</div>
	);
}

export const Active = ({ isDark }: { isDark: boolean }): FunctionComponent => {
	const { t } = useTranslation();
	const agentId = useAuthStore((state) => state.agentId);
	if (!agentId) {
		return <ConnectPrompt isDark={isDark} />;
	}
	return (
		<div className="space-y-5">
			<WorkList
				emptyLabel={t("marketplace.work.activeEmpty")}
				isDark={isDark}
				statuses={ACTIVE_STATUSES}
			/>
			<MyListings isDark={isDark} />
		</div>
	);
};

export const Delivered = ({
	isDark,
}: {
	isDark: boolean;
}): FunctionComponent => {
	const { t } = useTranslation();
	const agentId = useAuthStore((state) => state.agentId);
	if (!agentId) {
		return <ConnectPrompt isDark={isDark} />;
	}
	return (
		<WorkList
			emptyLabel={t("marketplace.work.deliveredEmpty")}
			isDark={isDark}
			statuses={DELIVERED_STATUSES}
		/>
	);
};
