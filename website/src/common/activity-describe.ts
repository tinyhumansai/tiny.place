// Shared formatter for activity events, used by both the full Activity list and
// the header ActivityMarquee so their labels never drift.

import type { ActivityEvent } from "@tinyhumansai/tinyplace";

// The backend emits some events as `ledger.<TYPE>` fallback kinds (the uppercase
// LedgerType) rather than a canonical activity kind. Map them back so the feed
// describes the action instead of dropping to a bare actor + amount.
const LEDGER_KIND_BY_TYPE: Record<string, string> = {
	REGISTRATION: "identity.registered",
	RENEWAL: "identity.renewed",
	SALE: "marketplace.purchase",
	PAYMENT: "payment",
	SUBSCRIPTION: "subscription",
	GROUP_FEE: "group.fee",
	EVENT_TICKET: "event.ticket",
	EVENT_REFUND: "event.refund",
	REVENUE_SHARE: "revenue.share",
	ESCROW_FUND: "escrow.fund",
	ESCROW_RELEASE: "escrow.release",
	ESCROW_REFUND: "escrow.refund",
	ARBITRATION_FEE: "arbitration.fee",
	FEE: "fee",
};

/** Normalizes a `ledger.<TYPE>` fallback kind to its canonical activity kind. */
function normalizeKind(kind: string): string {
	if (kind.startsWith("ledger.")) {
		const ledgerType = kind.slice("ledger.".length).toUpperCase();
		return LEDGER_KIND_BY_TYPE[ledgerType] ?? kind;
	}
	return kind;
}

const KIND_ICONS: Record<string, string> = {
	"marketplace.purchase": "🛒",
	"identity.registered": "✨",
	"identity.renewed": "♻️",
	subscription: "🔁",
	payment: "💸",
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

/** An emoji for an activity kind (resolves `ledger.<TYPE>` fallbacks too). */
export function activityIcon(kind: string): string {
	return KIND_ICONS[normalizeKind(kind)] ?? "•";
}

function shortName(value?: string | null): string {
	if (!value) {
		return "someone";
	}
	if (value.length <= 16) {
		return value;
	}
	return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

function amountLabel(event: ActivityEvent): string {
	if (!event.amount) {
		return "";
	}
	return ` ${event.amount}${event.asset ? ` ${event.asset}` : ""}`;
}

/** Last dotted segment, lower-cased, underscores spaced: `ledger.FOO_BAR` -> `foo bar`. */
function humanizeKind(kind: string): string {
	const segment = kind.split(".").pop() ?? kind;
	return segment.replace(/_/g, " ").toLowerCase();
}

/**
 * A human-readable description of an activity event — the action performed, not
 * just who performed it. Unknown kinds humanize their name instead of collapsing
 * to a bare actor, so the feed always says what happened.
 */
export function describeActivity(event: ActivityEvent): string {
	const actor = shortName(event.actor);
	const target = shortName(event.target);
	const amount = amountLabel(event);
	switch (normalizeKind(event.kind)) {
		case "marketplace.purchase":
			return `${actor} bought from ${target} for${amount || " an item"}`;
		case "identity.registered":
			return `${actor} registered a new identity`;
		case "identity.renewed":
			return `${actor} renewed their identity`;
		case "subscription":
			return `${actor} subscribed${amount}`;
		case "group.fee":
			return `${actor} paid a group fee${amount}`;
		case "event.ticket":
			return `${actor} bought an event ticket${amount}`;
		case "event.refund":
			return `${actor} was refunded for an event ticket${amount}`;
		case "revenue.share":
			return `${actor} earned a revenue share${amount}`;
		case "escrow.fund":
			return `${actor} funded escrow${amount}`;
		case "escrow.release":
			return `escrow released${amount} to ${target}`;
		case "escrow.refund":
			return `escrow refunded${amount} to ${target}`;
		case "arbitration.fee":
			return `${actor} paid an arbitration fee${amount}`;
		case "fee":
			return `${actor} paid a fee${amount}`;
		case "game.won":
			return `${actor} won${amount || " a hand"}`;
		case "game.lost":
			return `${actor} lost${amount || " a hand"}`;
		case "payment":
			return `${actor} paid ${target}${amount}`;
		default:
			return `${actor} ${humanizeKind(event.kind)}${amount}`.trim();
	}
}
