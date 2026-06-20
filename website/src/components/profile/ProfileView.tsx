import type { AgentProfile, ProfileAttestation } from "@tinyhumansai/tinyplace";
import { CheckBadgeIcon } from "@heroicons/react/24/solid";
import type { ReactElement, ReactNode } from "react";

import { formatUsdFromBaseUnits } from "@src/common/format-amount";

import { ProfileEntityLink } from "./EntityLink";

/** Human label + external profile URL for a verified external account. */
function attestationLink(attestation: ProfileAttestation): {
	label: string;
	url?: string;
} {
	const handle = attestation.handle.replace(/^@/, "");
	switch (attestation.platform.toLowerCase()) {
		case "twitter":
		case "x":
			return { label: `@${handle}`, url: `https://x.com/${handle}` };
		case "github":
			return { label: handle, url: `https://github.com/${handle}` };
		case "discord":
			return { label: handle };
		case "openhuman":
			return { label: handle, url: `https://openhuman.ai/${handle}` };
		case "website":
			return {
				label: handle,
				url: /^https?:\/\//.test(attestation.handle)
					? attestation.handle
					: `https://${handle}`,
			};
		default:
			return { label: handle };
	}
}

function platformLabel(platform: string): string {
	const lower = platform.toLowerCase();
	if (lower === "x" || lower === "twitter") {
		return "Twitter / X";
	}
	return platform.charAt(0).toUpperCase() + platform.slice(1);
}

function truncateCryptoId(cryptoId: string): string {
	if (cryptoId.length <= 12) {
		return cryptoId;
	}
	return `${cryptoId.slice(0, 6)}…${cryptoId.slice(-4)}`;
}

function formatDate(iso: string | undefined): string {
	if (!iso) {
		return "";
	}
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) {
		return "";
	}
	return date.toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

function linkLabel(url: string): string {
	try {
		return new URL(url).host.replace(/^www\./, "");
	} catch {
		return url;
	}
}

/** Theme-derived class strings, so the view renders in light or dark mode. */
type Theme = {
	surface: string;
	innerBorder: string;
	heading: string;
	primary: string;
	secondary: string;
	muted: string;
	body: string;
	chip: string;
};

function themeClasses(isDark: boolean): Theme {
	return isDark
		? {
				surface: "border-neutral-800 bg-neutral-950",
				innerBorder: "border-neutral-800",
				heading: "text-neutral-100",
				primary: "text-white",
				secondary: "text-neutral-400",
				muted: "text-neutral-500",
				body: "text-neutral-300",
				chip: "bg-neutral-900 text-neutral-300",
			}
		: {
				surface: "border-neutral-200 bg-white",
				innerBorder: "border-neutral-100",
				heading: "text-neutral-900",
				primary: "text-neutral-900",
				secondary: "text-neutral-500",
				muted: "text-neutral-400",
				body: "text-neutral-700",
				chip: "bg-neutral-100 text-neutral-600",
			};
}

function ActorBadge({ actorType }: { actorType: string }): ReactElement {
	const human = actorType === "human";
	const className = human
		? "bg-emerald-500/10 text-emerald-500"
		: "bg-violet-500/10 text-violet-500";
	return (
		<span
			className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${className}`}
			title={human ? "Self-declared human" : "Self-declared autonomous agent"}
		>
			{human ? "Human" : "Agent"}
		</span>
	);
}

type SectionProperties = {
	title: string;
	count?: number;
	theme: Theme;
	children: ReactNode;
};

function Section({
	title,
	count,
	theme,
	children,
}: SectionProperties): ReactElement {
	return (
		<section className={`rounded-lg border p-4 ${theme.surface}`}>
			<h2
				className={`mb-3 flex items-baseline gap-2 text-sm font-medium ${theme.heading}`}
			>
				{title}
				{count !== undefined && (
					<span className={`text-xs font-normal ${theme.muted}`}>{count}</span>
				)}
			</h2>
			{children}
		</section>
	);
}

type ProfileViewProperties = {
	profile: AgentProfile;
	/** Optional action affordances (e.g. an Edit button) rendered in the header. */
	actions?: ReactNode;
	/** Render in dark mode. Defaults to light (e.g. the public SEO route). */
	isDark?: boolean;
	/** Show activity inline. Profile tabs render it directly after the card. */
	showActivity?: boolean;
	/** Show owned handles inline. Profile tabs render them in a dedicated tab. */
	showHandles?: boolean;
	/**
	 * Optional reputation detail slot rendered below the profile sections. Pages
	 * pass a <ReputationPanel> here; keeping it a slot lets ProfileView stay
	 * hook-free and server-renderable on its own.
	 */
	reputation?: ReactNode;
};

/**
 * Presentational, hook-free render of a public agent profile. It is safe to use
 * from both server components (the SEO `/@handle` route) and client components
 * (the signed-in user's own profile page). Theme is supplied via the `isDark`
 * prop so the component stays hook-free.
 */
export function ProfileView({
	profile,
	actions,
	isDark = false,
	showActivity = true,
	showHandles = true,
	reputation,
}: ProfileViewProperties): ReactElement {
	const t = themeClasses(isDark);
	const displayName = profile.displayName?.trim() || profile.username;
	const initials = displayName.replace(/^@/, "").slice(0, 2).toUpperCase();
	const handles = profile.assets ?? [];
	const events = profile.events ?? [];
	const tags = profile.tags ?? [];
	const link = profile.link;
	const verifiedAccounts = (profile.attestations ?? []).filter(
		(attestation) => attestation.status === "verified"
	);

	return (
		<div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
			<header className={`rounded-lg border p-4 ${t.surface}`}>
				<div className="flex items-start gap-3">
					<div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-600 text-base font-semibold text-white">
						{initials}
					</div>
					<div className="min-w-0 flex-1">
						<div className="flex items-start justify-between gap-3">
							<div className="min-w-0">
								<div className="flex items-center gap-2">
									<h1
										className={`truncate text-base font-semibold ${t.heading}`}
									>
										{displayName}
									</h1>
									<ActorBadge actorType={profile.actorType} />
								</div>
								<p className={`text-sm ${t.secondary}`}>{profile.username}</p>
							</div>
							{actions}
						</div>
						<p
							className={`mt-1 font-mono text-xs ${t.muted}`}
							title={profile.cryptoId}
						>
							{truncateCryptoId(profile.cryptoId)}
						</p>
						{profile.bio && (
							<p className={`mt-3 text-sm leading-relaxed ${t.body}`}>
								{profile.bio}
							</p>
						)}
						{link && (
							<div className="mt-3 flex flex-wrap gap-3">
								<a
									className="text-xs font-medium text-blue-500 hover:underline"
									href={link}
									rel="nofollow noopener noreferrer"
									target="_blank"
								>
									{linkLabel(link)}
								</a>
							</div>
						)}
						{tags.length > 0 && (
							<div className="mt-3 flex flex-wrap gap-1.5">
								{tags.map((tag) => (
									<span
										key={tag}
										className={`rounded-full px-2 py-0.5 text-xs ${t.chip}`}
									>
										{tag}
									</span>
								))}
							</div>
						)}
						<p className={`mt-3 text-xs ${t.muted}`}>
							Joined {formatDate(profile.registeredAt)}
						</p>
					</div>
				</div>
			</header>

			{showHandles && (
				<Section count={handles.length} theme={t} title="Handles owned">
					{handles.length === 0 ? (
						<p className={`text-sm ${t.muted}`}>No handles owned.</p>
					) : (
						<ul className="flex flex-col gap-2">
							{handles.map((handle) => (
								<li
									key={handle.name}
									className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${t.innerBorder}`}
								>
									<span className="min-w-0">
										<ProfileEntityLink
											className={`font-medium hover:underline ${t.primary}`}
											value={handle.name}
										>
											{handle.name}
										</ProfileEntityLink>
									</span>
									<span
										className={`flex shrink-0 items-center gap-2 text-xs ${t.muted}`}
									>
										{handle.primary && (
											<span className="rounded-full bg-blue-500/10 px-2 py-0.5 font-medium text-blue-500">
												primary
											</span>
										)}
										<span>{handle.status}</span>
										<ProfileEntityLink
											value={handle.name}
											className={`rounded-md border px-2 py-1 font-medium transition-colors ${
												isDark
													? "border-neutral-700 text-neutral-300 hover:bg-neutral-900"
													: "border-neutral-200 text-neutral-700 hover:bg-neutral-100"
											}`}
										>
											View
										</ProfileEntityLink>
									</span>
								</li>
							))}
						</ul>
					)}
				</Section>
			)}

			{showActivity && profile.activity && (
				<Section theme={t} title="Activity">
					<dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
						<div>
							<dt className={`text-xs ${t.muted}`}>Transactions</dt>
							<dd className={`text-base font-semibold ${t.primary}`}>
								{profile.activity.transactionCount}
							</dd>
						</div>
						<div>
							<dt className={`text-xs ${t.muted}`}>Volume (USD)</dt>
							<dd className={`text-base font-semibold ${t.primary}`}>
								{formatUsdFromBaseUnits(profile.activity.totalVolumeUsd)}
							</dd>
						</div>
						<div>
							<dt className={`text-xs ${t.muted}`}>Counterparties</dt>
							<dd className={`text-base font-semibold ${t.primary}`}>
								{profile.activity.uniqueCounterparties}
							</dd>
						</div>
					</dl>
				</Section>
			)}

			{events.length > 0 && (
				<Section count={events.length} theme={t} title="Events">
					<ul className="flex flex-col gap-2">
						{events.map((event) => (
							<li
								key={event.eventId}
								className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${t.innerBorder}`}
							>
								<span className={t.primary}>{event.name}</span>
								<span className={`text-xs ${t.muted}`}>{event.status}</span>
							</li>
						))}
					</ul>
				</Section>
			)}

			{verifiedAccounts.length > 0 && (
				<Section
					count={verifiedAccounts.length}
					theme={t}
					title="Verified accounts"
				>
					<ul className="flex flex-col gap-2">
						{verifiedAccounts.map((attestation) => {
							const { label, url } = attestationLink(attestation);
							return (
								<li
									key={`${attestation.platform}:${attestation.handle}`}
									className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${t.innerBorder}`}
								>
									<span className="flex min-w-0 items-center gap-2">
										<CheckBadgeIcon
											aria-hidden
											className="h-4 w-4 shrink-0 text-sky-500"
										/>
										<span className={`shrink-0 text-xs ${t.muted}`}>
											{platformLabel(attestation.platform)}
										</span>
										{url ? (
											<a
												className="truncate font-medium text-blue-500 hover:underline"
												href={url}
												rel="nofollow noopener noreferrer"
												target="_blank"
											>
												{label}
											</a>
										) : (
											<span className={`truncate font-medium ${t.primary}`}>
												{label}
											</span>
										)}
									</span>
									<span className="shrink-0 rounded-full bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-sky-500">
										verified
									</span>
								</li>
							);
						})}
					</ul>
				</Section>
			)}

			{reputation}
		</div>
	);
}
