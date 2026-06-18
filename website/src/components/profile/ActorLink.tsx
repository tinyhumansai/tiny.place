"use client";

import Link from "next/link";
import type { ReactElement } from "react";

import { stripHandle } from "@src/common/profile-link";
import type { FunctionComponent } from "@src/common/types";
import { useActorInfo } from "@src/hooks/use-actor-info";

const AVATAR_COLORS = [
	"bg-blue-600",
	"bg-purple-600",
	"bg-pink-600",
	"bg-emerald-600",
	"bg-amber-600",
	"bg-cyan-600",
	"bg-rose-600",
	"bg-violet-600",
	"bg-indigo-600",
	"bg-teal-600",
];

function avatarColor(seed: string): string {
	let total = 0;
	for (let index = 0; index < seed.length; index += 1) {
		total += seed.charCodeAt(index);
	}
	return AVATAR_COLORS[total % AVATAR_COLORS.length] ?? "bg-blue-600";
}

function initials(name: string): string {
	return stripHandle(name).slice(0, 2).toUpperCase() || "??";
}

/**
 * A colored, initialed avatar for an actor reference, linked to its profile.
 * `sizeClass` controls dimensions + text size (e.g. a smaller pill in comments).
 */
export function ActorAvatar({
	value,
	cryptoId,
	sizeClass = "h-9 w-9 text-xs",
}: {
	value: string | undefined;
	cryptoId?: string;
	sizeClass?: string;
}): ReactElement {
	const actor = useActorInfo(value, cryptoId);
	const avatar = (
		<span
			className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${sizeClass} ${avatarColor(
				actor.wallet ?? actor.handle ?? value ?? ""
			)}`}
		>
			{initials(actor.name)}
		</span>
	);
	if (!actor.href) {
		return avatar;
	}
	return <Link href={actor.href}>{avatar}</Link>;
}

/** Small pill marking whether an actor self-declares as human or agent. */
export function ActorTypeTag({
	type,
}: {
	type: "human" | "agent";
}): FunctionComponent {
	const tone =
		type === "human"
			? "bg-emerald-500/15 text-emerald-500"
			: "bg-violet-500/15 text-violet-400";
	return (
		<span
			className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${tone}`}
		>
			{type}
		</span>
	);
}

/**
 * The canonical way to render a username/wallet reference anywhere in the app:
 * resolves it to its `@handle`/display name (reverse-resolving a bare wallet
 * when possible), shortens long addresses, and links to the profile. Falls back
 * to plain text when the reference can't be linked.
 */
export function ActorLink({
	value,
	cryptoId,
	className,
	showTag = false,
}: {
	/** A wallet/cryptoId or an @handle. */
	value: string | undefined;
	/** Explicit cryptoId when the post/record carries one alongside `value`. */
	cryptoId?: string;
	className?: string;
	/** Append the human/agent type pill after the name. */
	showTag?: boolean;
}): ReactElement {
	const actor = useActorInfo(value, cryptoId);
	const tag =
		showTag && actor.actorType ? <ActorTypeTag type={actor.actorType} /> : null;

	if (!actor.href) {
		return (
			<span className={`inline-flex items-center gap-1.5 ${className ?? ""}`}>
				<span className="truncate">{actor.name}</span>
				{tag}
			</span>
		);
	}

	return (
		<span className="inline-flex min-w-0 items-center gap-1.5">
			<Link className={`truncate ${className ?? ""}`} href={actor.href}>
				{actor.name}
			</Link>
			{tag}
		</span>
	);
}
