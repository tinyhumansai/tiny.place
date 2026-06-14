import type { Rank, Suit } from "@src/components/poker/Card";

// A single event received over a room's live WebSocket stream. The backend wraps
// each event as { type, data }; we keep a monotonic seq so the chatbox can key
// and order lines without relying on wall-clock timestamps.
export type RoomStreamEvent = {
	seq: number;
	type: string;
	data: unknown;
};

// A formatted line in the live action chatbox.
export type RoomChatLine = {
	seq: number;
	text: string;
	tone: "action" | "system" | "win";
};

const suitByLetter: Record<string, Suit> = {
	s: "spades",
	h: "hearts",
	d: "diamonds",
	c: "clubs",
};

const suitSymbol: Record<Suit, string> = {
	spades: "♠",
	hearts: "♥",
	diamonds: "♦",
	clubs: "♣",
};

const validRanks = new Set<Rank>([
	"2",
	"3",
	"4",
	"5",
	"6",
	"7",
	"8",
	"9",
	"10",
	"J",
	"Q",
	"K",
	"A",
]);

/**
 * parseCard turns a backend card string ("As", "Td", "9c") into the rank/suit
 * pair the Card component renders. The backend uses "T" for ten; we normalize it
 * to "10". Returns undefined for empty, sealed, or malformed cards so callers can
 * render a face-down placeholder instead.
 */
export function parseCard(
	card: string | undefined
): { rank: Rank; suit: Suit } | undefined {
	if (!card) {
		return undefined;
	}
	const trimmed = card.trim();
	if (trimmed.length < 2) {
		return undefined;
	}
	const suitLetter = trimmed.slice(-1).toLowerCase();
	const rankPart = trimmed.slice(0, -1).toUpperCase();
	const suit = suitByLetter[suitLetter];
	if (!suit) {
		return undefined;
	}
	const rank = (rankPart === "T" ? "10" : rankPart) as Rank;
	if (!validRanks.has(rank)) {
		return undefined;
	}
	return { rank, suit };
}

/** cardLabel renders a card string as a compact "A♠" label for the chatbox. */
export function cardLabel(card: string): string {
	const parsed = parseCard(card);
	if (!parsed) {
		return card;
	}
	return `${parsed.rank}${suitSymbol[parsed.suit]}`;
}

/**
 * formatChips trims a fixed-point chip amount ("19.800000") to a human-friendly
 * form ("19.8", "2", "0.5") without losing precision that matters at a glance.
 */
export function formatChips(amount: string | undefined): string {
	if (amount === undefined) {
		return "0";
	}
	const trimmed = amount.trim();
	if (trimmed === "") {
		return "0";
	}
	if (!trimmed.includes(".")) {
		return trimmed;
	}
	const withoutTrailingZeros = trimmed.replace(/0+$/, "").replace(/\.$/, "");
	return withoutTrailingZeros === "" ? "0" : withoutTrailingZeros;
}

const actionVerb: Record<string, string> = {
	fold: "folds",
	check: "checks",
	call: "calls",
	bet: "bets",
	raise: "raises",
	"all-in": "is all-in",
	// eslint-disable-next-line camelcase -- backend action name is snake_case
	post_blind: "posts blind",
};

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object"
		? (value as Record<string, unknown>)
		: {};
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
	return typeof value === "number" ? value : undefined;
}

function capitalize(value: string): string {
	return value.length === 0
		? value
		: value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * describeRoomEvent turns a raw room stream event into a single human-readable
 * chatbox line, or undefined when the event carries no narration (e.g. the
 * per-seat action_required prompt the table UI already highlights). seatName
 * resolves a seat number to a display handle. It is pure so it can be unit
 * tested independently of the socket.
 */
export function describeRoomEvent(
	event: RoomStreamEvent,
	seatName: (seat: number) => string
): RoomChatLine | undefined {
	const data = asRecord(event.data);
	const line = (text: string, tone: RoomChatLine["tone"]): RoomChatLine => ({
		seq: event.seq,
		text,
		tone,
	});

	switch (event.type) {
		case "hand_start": {
			const handNumber = asNumber(data["handNumber"]);
			return line(
				handNumber === undefined
					? "New hand dealt"
					: `New hand #${handNumber} dealt`,
				"system"
			);
		}
		case "action": {
			const seat = asNumber(data["seat"]) ?? 0;
			const actionName = asString(data["action"]) ?? "";
			const verb = actionVerb[actionName] ?? actionName ?? "acts";
			const amount = asString(data["amount"]);
			const chips =
				amount && formatChips(amount) !== "0" ? ` ${formatChips(amount)}` : "";
			return line(`${seatName(seat)} ${verb}${chips}`, "action");
		}
		case "community_cards": {
			const street = asString(data["street"]) ?? "board";
			const raw = data["cards"];
			const cards = Array.isArray(raw)
				? raw.filter((card): card is string => typeof card === "string")
				: [];
			return line(
				`${capitalize(street)}: ${cards.map(cardLabel).join(" ")}`,
				"system"
			);
		}
		case "showdown":
			return line("Showdown — cards revealed", "system");
		case "hand_result": {
			const raw = data["winners"];
			const winners = Array.isArray(raw) ? raw.map(asRecord) : [];
			if (winners.length === 0) {
				return line("Hand complete", "system");
			}
			const names = winners
				.map(
					(winner) =>
						asString(winner["agent"]) ?? seatName(asNumber(winner["seat"]) ?? 0)
				)
				.join(", ");
			const payout = formatChips(asString(winners[0]?.["payout"]));
			return line(`${names} wins ${payout}`, "win");
		}
		case "player_join": {
			const handle =
				asString(data["handle"]) ?? seatName(asNumber(data["seat"]) ?? 0);
			return line(`${handle} joined the table`, "system");
		}
		case "player_leave": {
			const handle =
				asString(data["handle"]) ?? seatName(asNumber(data["seat"]) ?? 0);
			return line(`${handle} left the table`, "system");
		}
		case "player_timeout": {
			const seat = asNumber(data["seat"]) ?? 0;
			const action = asString(data["action"]) ?? "folds";
			return line(`${seatName(seat)} timed out (${action})`, "system");
		}
		case "player_timeout_refund": {
			const handle =
				asString(data["handle"]) ?? seatName(asNumber(data["seat"]) ?? 0);
			return line(`${handle} removed and refunded`, "system");
		}
		default:
			return undefined;
	}
}
