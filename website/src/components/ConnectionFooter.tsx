"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { SessionWalletSigner } from "@src/common/session-wallet";
import type { FunctionComponent } from "@src/common/types";
import { useAppStore } from "@src/store/app";
import { useAuthStore } from "@src/store/auth";

const API_BASE_URL =
	process.env["NEXT_PUBLIC_API_BASE_URL"] ?? "https://staging-api.tiny.place";

/** Strips the scheme so only the host (+ path) shows in the status bar. */
function serverHost(url: string): string {
	return url.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

/** Shortens a long key/id to `head…tail` for compact display. */
function truncateId(value: string, head = 6, tail = 4): string {
	if (value.length <= head + tail + 1) return value;
	return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/** Formats the time until `expiresAt` as a compact `23h 40m` / `expired`. */
function formatExpiry(expiresAt: string, nowMs: number): string {
	const remaining = Date.parse(expiresAt) - nowMs;
	if (Number.isNaN(remaining)) return "—";
	if (remaining <= 0) return "expired";
	const totalMinutes = Math.floor(remaining / 60_000);
	const days = Math.floor(totalMinutes / (60 * 24));
	const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
	const minutes = totalMinutes % 60;
	if (days > 0) return `${days}d ${hours}h`;
	if (hours > 0) return `${hours}h ${minutes}m`;
	return `${minutes}m`;
}

type StatProps = {
	isDark: boolean;
	label: string;
	value: string;
	title?: string;
};

const Stat = ({
	isDark,
	label,
	value,
	title,
}: StatProps): FunctionComponent => (
	<span className="flex items-center gap-1 whitespace-nowrap" title={title}>
		<span className={isDark ? "text-white/40" : "text-black/40"}>{label}</span>
		<span className={`font-mono ${isDark ? "text-white/80" : "text-black/80"}`}>
			{value}
		</span>
	</span>
);

const Divider = ({ isDark }: { isDark: boolean }): FunctionComponent => (
	<span aria-hidden className={isDark ? "text-white/15" : "text-black/15"}>
		|
	</span>
);

/**
 * A thin fixed status bar pinned to the bottom of every page, surfacing live
 * connection state: whether a session is active, which backend it targets, and
 * the active agent / session-key / grant-expiry. A plain wallet fallback (no hot
 * session) shows "wallet only" with no session id or expiry.
 */
export const ConnectionFooter = (): FunctionComponent => {
	const { t } = useTranslation();
	const { connected } = useWallet();
	const signer = useAuthStore((state) => state.signer);
	const agentId = useAuthStore((state) => state.agentId);
	const isDark = useAppStore((state) => state.theme) === "dark";

	// A 30s tick keeps the expiry countdown roughly live without churn.
	const [nowMs, setNowMs] = useState(() => Date.now());
	useEffect(() => {
		const interval = setInterval(() => {
			setNowMs(Date.now());
		}, 30_000);
		return (): void => {
			clearInterval(interval);
		};
	}, []);

	const session = signer instanceof SessionWalletSigner ? signer : undefined;
	const authenticated = Boolean(signer);

	const statusLabel = !connected
		? t("connection.disconnected")
		: session
			? t("connection.connected")
			: t("connection.walletOnly");
	const statusColor = !connected
		? "bg-red-400"
		: session
			? "bg-emerald-400"
			: "bg-amber-400";

	return (
		<footer
			className={`fixed inset-x-0 bottom-0 z-50 flex h-7 items-center gap-3 overflow-x-auto border-t px-3 text-[11px] leading-none backdrop-blur ${
				isDark
					? "border-white/10 bg-neutral-950/90 text-white/70"
					: "border-black/10 bg-white/90 text-black/70"
			}`}
		>
			<span className="flex items-center gap-1.5 whitespace-nowrap">
				<span className={`size-1.5 rounded-full ${statusColor}`} />
				<span
					className={`font-medium ${isDark ? "text-white/80" : "text-black/80"}`}
				>
					{statusLabel}
				</span>
			</span>
			<Divider isDark={isDark} />
			<Stat
				isDark={isDark}
				label={t("connection.server")}
				value={serverHost(API_BASE_URL)}
			/>
			{authenticated && agentId ? (
				<>
					<Divider isDark={isDark} />
					<Stat
						isDark={isDark}
						label={t("connection.agent")}
						title={agentId}
						value={truncateId(agentId)}
					/>
				</>
			) : null}
			{session ? (
				<>
					<Divider isDark={isDark} />
					<Stat
						isDark={isDark}
						label={t("connection.session")}
						title={session.sessionKey}
						value={truncateId(session.sessionKey)}
					/>
					<Divider isDark={isDark} />
					<Stat
						isDark={isDark}
						label={t("connection.expires")}
						title={session.expiresAt}
						value={formatExpiry(session.expiresAt, nowMs)}
					/>
				</>
			) : null}
		</footer>
	);
};
