"use client";

import { useTranslation } from "react-i18next";

import type { FunctionComponent } from "@src/common/types";
import { useTinyplaceWallet } from "@src/common/tinyplace-wallet";
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
 * connection state: whether the wallet is connected, which backend it targets,
 * and the active agent.
 */
export const ConnectionFooter = (): FunctionComponent => {
	const { t } = useTranslation();
	const { connected } = useTinyplaceWallet();
	const signer = useAuthStore((state) => state.signer);
	const agentId = useAuthStore((state) => state.agentId);
	const isDark = useAppStore((state) => state.theme) === "dark";

	const authenticated = Boolean(signer);

	const statusLabel = connected
		? t("connection.connected")
		: t("connection.disconnected");
	const statusColor = connected ? "bg-emerald-400" : "bg-red-400";

	return (
		<footer
			className={`fixed bottom-0 left-0 right-0 z-30 flex h-7 items-center gap-3 overflow-x-auto border-t px-3 text-[11px] leading-none md:left-48 ${
				isDark
					? "border-white/10 bg-neutral-950 text-white/70"
					: "border-black/10 bg-white text-black/70"
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
		</footer>
	);
};
