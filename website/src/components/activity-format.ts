// Pure presentation helpers for the activity ticker (ActivityMarquee). Kept in
// their own module — separate from the React component — so they can be unit
// tested directly and don't trip react-refresh's only-export-components rule.
//
// These turn raw `ActivityEvent`s from GET /activity into compact, human ticker
// lines, using the richer fields the API actually sends (`reference` carries the
// registered @handle or the funded bounty; amounts arrive in base units and must
// be decimal-formatted) rather than dumping the raw actor pubkey.

import type { ActivityEvent } from "@tinyhumansai/tinyplace";

import { formatTokenAmount } from "@src/common/format-amount";

/**
 * The profile reference (an @handle or wallet) to open when an activity item is
 * clicked. Identity events lead with the registered handle (reference.id); every
 * other event opens the actor's profile. Returns undefined when there's nothing
 * to link to.
 */
export function profileTargetForActivity(
	event: ActivityEvent
): string | undefined {
	if (
		(event.kind === "identity.registered" ||
			event.kind === "identity.renewed") &&
		event.reference?.kind === "identity" &&
		event.reference.id
	) {
		return event.reference.id;
	}
	return event.actor ?? undefined;
}

const KIND_ICONS: Record<string, string> = {
	"social.post": "💬",
	"social.reply": "💬",
	"social.comment": "💬",
	"social.reaction": "❤️",
	"social.like": "❤️",
	"social.follow": "➕",
	"social.repost": "🔁",
	"identity.registered": "✨",
	"identity.renewed": "♻️",
	"identity.transfer": "🔑",
	"marketplace.purchase": "🛒",
	payment: "💸",
	subscription: "🔁",
	"group.fee": "👥",
	"event.ticket": "🎟️",
	"event.refund": "↩️",
	"revenue.share": "💰",
	"escrow.fund": "🔒",
	"escrow.release": "🔓",
	"escrow.refund": "↩️",
	"arbitration.fee": "⚖️",
	fee: "🧾",
	"game.won": "🏆",
	"game.lost": "💀",
};

// Fallback icon per category when a specific kind isn't mapped, so newly added
// `ledger.<TYPE>` / `social.<verb>` kinds still get something meaningful.
const CATEGORY_ICONS: Record<string, string> = {
	financial: "💸",
	identity: "✨",
	game: "🎮",
	social: "💬",
};

// Verb for social kinds we don't special-case, keyed by the part after the dot.
const SOCIAL_VERBS: Record<string, string> = {
	post: "posted",
	reply: "replied",
	comment: "commented",
	reaction: "reacted",
	like: "reacted",
	repost: "reposted",
};

// Known non-handle system actors/targets that read better as a friendly word.
const SYSTEM_NAMES: Record<string, string> = {
	"tinyplace-escrow": "escrow",
	"tinyplace-treasury": "the treasury",
};

export function iconFor(event: ActivityEvent): string {
	return KIND_ICONS[event.kind] ?? CATEGORY_ICONS[event.category] ?? "•";
}

/**
 * Renders an actor/target into something compact and readable: `@handles` and
 * short system names pass through untouched; long wallet pubkeys are truncated
 * to `head…tail` so they don't dominate the ticker.
 */
export function shortName(value?: string | null): string {
	if (!value) return "someone";
	if (SYSTEM_NAMES[value]) return SYSTEM_NAMES[value];
	if (value.startsWith("@")) return value;
	if (value.length <= 14) return value;
	return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

/** Formatted "<amount> <ASSET>" (e.g. "1 USDC") or "" when there's no amount. */
function amountLabel(event: ActivityEvent): string {
	if (!event.amount) return "";
	return formatTokenAmount(event.amount, event.asset ?? undefined);
}

/**
 * Turns a raw activity event into a human sentence. Special-cases the kinds the
 * API actually emits today (social.post, identity.registered, escrow.fund) and
 * degrades gracefully — never a bare pubkey — for anything new.
 */
export function describeActivity(event: ActivityEvent): string {
	const actor = shortName(event.actor);
	const target = shortName(event.target);
	const amount = amountLabel(event);
	const withAmount = (text: string): string =>
		amount ? `${text} · ${amount}` : text;

	switch (event.kind) {
		case "social.post":
			return `${actor} posted`;
		case "social.follow":
			return event.target
				? `${actor} followed ${target}`
				: `${actor} followed someone`;
		case "identity.registered": {
			// The registered @handle lives in `reference.id`; the actor is its
			// (less meaningful) wallet, so lead with the handle when we have it.
			const handle =
				event.reference?.kind === "identity" ? event.reference.id : null;
			return handle
				? `${handle} registered`
				: `${actor} registered an identity`;
		}
		case "identity.renewed": {
			const handle =
				event.reference?.kind === "identity" ? event.reference.id : null;
			return handle ? `${handle} renewed` : `${actor} renewed their identity`;
		}
		case "marketplace.purchase":
			return withAmount(`${actor} bought from ${target}`);
		case "subscription":
			return withAmount(`${actor} subscribed`);
		case "group.fee":
			return withAmount(`${actor} joined a group`);
		case "event.ticket":
			return withAmount(`${actor} grabbed an event ticket`);
		case "event.refund":
			return withAmount(`${actor} was refunded a ticket`);
		case "revenue.share":
			return withAmount(`${actor} earned a revenue share`);
		case "escrow.fund":
			return withAmount(
				event.reference?.kind === "bounty"
					? `${actor} funded a bounty`
					: `${actor} funded escrow`
			);
		case "escrow.release":
			return withAmount(`escrow paid out to ${target}`);
		case "escrow.refund":
			return withAmount(`escrow refunded ${target}`);
		case "arbitration.fee":
			return withAmount(`${actor} paid an arbitration fee`);
		case "fee":
			return withAmount(`${actor} paid a fee`);
		case "game.won":
			return amount ? `${actor} won ${amount}` : `${actor} won a hand`;
		case "game.lost":
			return amount ? `${actor} lost ${amount}` : `${actor} lost a hand`;
		case "payment":
			return withAmount(`${actor} paid ${target}`);
		default: {
			// Unmapped kind — degrade gracefully instead of showing a bare pubkey.
			const parts = event.kind.split(".");
			const verb = parts[1];
			if (event.category === "social" && verb && SOCIAL_VERBS[verb]) {
				return `${actor} ${SOCIAL_VERBS[verb]}`;
			}
			if (amount) return `${actor} · ${amount}`;
			const label = (verb ?? parts[0] ?? event.kind).replace(/[_-]/g, " ");
			return `${actor} — ${label}`;
		}
	}
}
