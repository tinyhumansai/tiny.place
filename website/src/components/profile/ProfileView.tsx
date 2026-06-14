import type { AgentProfile } from "@tinyhumansai/tinyplace";
import type { ReactElement, ReactNode } from "react";

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

function ActorBadge({ actorType }: { actorType: string }): ReactElement {
	const human = actorType === "human";
	const className = human
		? "bg-emerald-50 text-emerald-700"
		: "bg-violet-50 text-violet-700";
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
	children: ReactNode;
};

function Section({ title, count, children }: SectionProperties): ReactElement {
	return (
		<section className="rounded-xl border border-neutral-200 bg-white p-5">
			<h2 className="mb-3 flex items-baseline gap-2 text-sm font-semibold tracking-wide text-neutral-900 uppercase">
				{title}
				{count !== undefined && (
					<span className="text-xs font-normal text-neutral-400">{count}</span>
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
};

/**
 * Presentational, hook-free render of a public agent profile. It is safe to use
 * from both server components (the SEO `/@handle` route) and client components
 * (the signed-in user's own profile page).
 */
export function ProfileView({
	profile,
	actions,
}: ProfileViewProperties): ReactElement {
	const displayName = profile.displayName?.trim() || profile.username;
	const initials = displayName.replace(/^@/, "").slice(0, 2).toUpperCase();
	const assets = profile.assets ?? [];
	const groups = profile.groups ?? [];
	const events = profile.events ?? [];
	const tags = profile.tags ?? [];
	const links = profile.links ?? [];

	return (
		<div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
			<header className="rounded-xl border border-neutral-200 bg-white p-6">
				<div className="flex items-start gap-4">
					<div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xl font-semibold text-white">
						{initials}
					</div>
					<div className="min-w-0 flex-1">
						<div className="flex items-start justify-between gap-3">
							<div className="min-w-0">
								<div className="flex items-center gap-2">
									<h1 className="truncate text-xl font-semibold text-neutral-900">
										{displayName}
									</h1>
									<ActorBadge actorType={profile.actorType} />
								</div>
								<p className="text-sm text-neutral-500">{profile.username}</p>
							</div>
							{actions}
						</div>
						<p
							className="mt-1 font-mono text-xs text-neutral-400"
							title={profile.cryptoId}
						>
							{truncateCryptoId(profile.cryptoId)}
						</p>
						{profile.bio && (
							<p className="mt-3 text-sm leading-relaxed text-neutral-700">
								{profile.bio}
							</p>
						)}
						{links.length > 0 && (
							<div className="mt-3 flex flex-wrap gap-3">
								{links.map((url) => (
									<a
										key={url}
										className="text-xs font-medium text-blue-600 hover:underline"
										href={url}
										rel="nofollow noopener noreferrer"
										target="_blank"
									>
										{linkLabel(url)}
									</a>
								))}
							</div>
						)}
						{tags.length > 0 && (
							<div className="mt-3 flex flex-wrap gap-1.5">
								{tags.map((tag) => (
									<span
										key={tag}
										className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600"
									>
										{tag}
									</span>
								))}
							</div>
						)}
						<p className="mt-3 text-xs text-neutral-400">
							Joined {formatDate(profile.registeredAt)}
						</p>
					</div>
				</div>
			</header>

			<Section count={assets.length} title="Assets">
				{assets.length === 0 ? (
					<p className="text-sm text-neutral-400">No domains owned.</p>
				) : (
					<ul className="flex flex-col gap-2">
						{assets.map((asset) => (
							<li
								key={asset.name}
								className="flex items-center justify-between rounded-lg border border-neutral-100 px-3 py-2"
							>
								<span className="font-medium text-neutral-900">
									{asset.name}
								</span>
								<span className="flex items-center gap-2 text-xs text-neutral-400">
									{asset.primary && (
										<span className="rounded-full bg-blue-50 px-2 py-0.5 font-medium text-blue-600">
											primary
										</span>
									)}
									{asset.status}
								</span>
							</li>
						))}
					</ul>
				)}
			</Section>

			{profile.activity && (
				<Section title="Activity">
					<dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
						<div>
							<dt className="text-xs text-neutral-400">Transactions</dt>
							<dd className="text-lg font-semibold text-neutral-900">
								{profile.activity.transactionCount}
							</dd>
						</div>
						<div>
							<dt className="text-xs text-neutral-400">Volume (USD)</dt>
							<dd className="text-lg font-semibold text-neutral-900">
								${profile.activity.totalVolumeUsd}
							</dd>
						</div>
						<div>
							<dt className="text-xs text-neutral-400">Counterparties</dt>
							<dd className="text-lg font-semibold text-neutral-900">
								{profile.activity.uniqueCounterparties}
							</dd>
						</div>
					</dl>
				</Section>
			)}

			{groups.length > 0 && (
				<Section count={groups.length} title="Groups">
					<ul className="flex flex-col gap-2">
						{groups.map((group) => (
							<li
								key={group.groupId}
								className="flex items-center justify-between rounded-lg border border-neutral-100 px-3 py-2 text-sm"
							>
								<span className="text-neutral-900">{group.name}</span>
								<span className="text-xs text-neutral-400">{group.role}</span>
							</li>
						))}
					</ul>
				</Section>
			)}

			{events.length > 0 && (
				<Section count={events.length} title="Events">
					<ul className="flex flex-col gap-2">
						{events.map((event) => (
							<li
								key={event.eventId}
								className="flex items-center justify-between rounded-lg border border-neutral-100 px-3 py-2 text-sm"
							>
								<span className="text-neutral-900">{event.name}</span>
								<span className="text-xs text-neutral-400">{event.status}</span>
							</li>
						))}
					</ul>
				</Section>
			)}
		</div>
	);
}
