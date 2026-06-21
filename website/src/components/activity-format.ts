// Pure presentation helpers for the activity ticker (ActivityMarquee). Kept in
// their own module — separate from the React component — so they can be unit
// tested directly and don't trip react-refresh's only-export-components rule.
//
// These turn raw `ActivityEvent`s from GET /activity into compact, human ticker
// lines, using the richer fields the API actually sends (`reference` carries the
// registered @handle or the funded bounty; amounts arrive in base units and must
// be decimal-formatted) rather than dumping the raw actor pubkey.
//
// Copy is localized: callers pass an i18next `t` (the marquee is a client
// component with `useTranslation`), so these helpers stay pure.

import type { TFunction } from "i18next";

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

// Verb i18n keys for social kinds we don't special-case, keyed by the part after
// the dot. Resolved against `activityMarquee.verbs.*`.
const SOCIAL_VERB_KEYS: Record<string, string> = {
	post: "posted",
	reply: "replied",
	comment: "commented",
	reaction: "reacted",
	like: "reacted",
	repost: "reposted",
};

// Known non-handle system actors/targets that read better as a friendly word.
const SYSTEM_NAME_KEYS: Record<string, string> = {
	"tinyplace-escrow": "systemEscrow",
	"tinyplace-treasury": "systemTreasury",
};

export function iconFor(event: ActivityEvent): string {
	return KIND_ICONS[event.kind] ?? CATEGORY_ICONS[event.category] ?? "•";
}

/**
 * Renders an actor/target into something compact and readable: `@handles` and
 * short system names pass through untouched; long wallet pubkeys are truncated
 * to `head…tail` so they don't dominate the ticker.
 */
export function shortName(
	value: string | null | undefined,
	t: TFunction
): string {
	if (!value) return t("activityMarquee.someone");
	const systemKey = SYSTEM_NAME_KEYS[value];
	if (systemKey) {
		return t(`activityMarquee.${systemKey}`, { defaultValue: value });
	}
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
 * degrades gracefully — never a bare pubkey — for anything new. Copy is resolved
 * through the passed-in i18next `t`.
 */
export function describeActivity(event: ActivityEvent, t: TFunction): string {
	const actor = shortName(event.actor, t);
	const target = shortName(event.target, t);
	const amount = amountLabel(event);
	const withAmount = (text: string): string =>
		amount ? `${text} · ${amount}` : text;

	switch (event.kind) {
		case "social.post":
			return t("activityMarquee.posted", { actor });
		case "social.follow":
			return event.target
				? t("activityMarquee.followed", { actor, target })
				: t("activityMarquee.followedSomeone", { actor });
		case "identity.registered": {
			// The registered @handle lives in `reference.id`; the actor is its
			// (less meaningful) wallet, so lead with the handle when we have it.
			const handle =
				event.reference?.kind === "identity" ? event.reference.id : null;
			return handle
				? t("activityMarquee.registered", { handle })
				: t("activityMarquee.registeredIdentity", { actor });
		}
		case "identity.renewed": {
			const handle =
				event.reference?.kind === "identity" ? event.reference.id : null;
			return handle
				? t("activityMarquee.renewed", { handle })
				: t("activityMarquee.renewedIdentity", { actor });
		}
		case "marketplace.purchase":
			return withAmount(t("activityMarquee.boughtFrom", { actor, target }));
		case "subscription":
			return withAmount(t("activityMarquee.subscribed", { actor }));
		case "group.fee":
			return withAmount(t("activityMarquee.joinedGroup", { actor }));
		case "event.ticket":
			return withAmount(t("activityMarquee.grabbedTicket", { actor }));
		case "event.refund":
			return withAmount(t("activityMarquee.ticketRefunded", { actor }));
		case "revenue.share":
			return withAmount(t("activityMarquee.earnedRevenue", { actor }));
		case "escrow.fund":
			return withAmount(
				event.reference?.kind === "bounty"
					? t("activityMarquee.fundedBounty", { actor })
					: t("activityMarquee.fundedEscrow", { actor })
			);
		case "escrow.release":
			return withAmount(t("activityMarquee.escrowPaidOut", { target }));
		case "escrow.refund":
			return withAmount(t("activityMarquee.escrowRefunded", { target }));
		case "arbitration.fee":
			return withAmount(t("activityMarquee.arbitrationFee", { actor }));
		case "fee":
			return withAmount(t("activityMarquee.paidFee", { actor }));
		case "game.won":
			return amount
				? t("activityMarquee.wonAmount", { actor, amount })
				: t("activityMarquee.wonHand", { actor });
		case "game.lost":
			return amount
				? t("activityMarquee.lostAmount", { actor, amount })
				: t("activityMarquee.lostHand", { actor });
		case "payment":
			return withAmount(t("activityMarquee.paid", { actor, target }));
		default: {
			// Unmapped kind — degrade gracefully instead of showing a bare pubkey.
			const parts = event.kind.split(".");
			const verb = parts[1];
			if (event.category === "social" && verb && SOCIAL_VERB_KEYS[verb]) {
				return t("activityMarquee.socialAction", {
					actor,
					verb: t(`activityMarquee.verbs.${SOCIAL_VERB_KEYS[verb]}`, {
						defaultValue: SOCIAL_VERB_KEYS[verb],
					}),
				});
			}
			if (amount) return `${actor} · ${amount}`;
			const label = (verb ?? parts[0] ?? event.kind).replace(/[_-]/g, " ");
			return t("activityMarquee.genericLabel", { actor, label });
		}
	}
}
