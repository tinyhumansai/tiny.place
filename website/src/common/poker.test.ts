import { describe, expect, it } from "vitest";

import {
	cardLabel,
	describeRoomEvent,
	formatChips,
	parseCard,
	type RoomStreamEvent,
} from "./poker";

const seatName = (seat: number): string =>
	({ 1: "@alice", 2: "@bob" })[seat] ?? `Seat ${seat}`;

const event = (type: string, data: unknown): RoomStreamEvent => ({
	seq: 1,
	type,
	data,
});

describe("parseCard", () => {
	it("parses ranks and suits, normalizing T to 10", () => {
		expect(parseCard("As")).toEqual({ rank: "A", suit: "spades" });
		expect(parseCard("Td")).toEqual({ rank: "10", suit: "diamonds" });
		expect(parseCard("9c")).toEqual({ rank: "9", suit: "clubs" });
		expect(parseCard("Kh")).toEqual({ rank: "K", suit: "hearts" });
	});

	it("returns undefined for empty, sealed, or malformed cards", () => {
		expect(parseCard(undefined)).toBeUndefined();
		expect(parseCard("")).toBeUndefined();
		expect(parseCard("sealed:@bob:abcd")).toBeUndefined();
		expect(parseCard("Zx")).toBeUndefined();
		expect(parseCard("A")).toBeUndefined();
	});
});

describe("cardLabel", () => {
	it("renders a compact rank+suit symbol", () => {
		expect(cardLabel("As")).toBe("A♠");
		expect(cardLabel("Th")).toBe("10♥");
	});
});

describe("formatChips", () => {
	it("trims trailing zeros without losing precision", () => {
		expect(formatChips("19.800000")).toBe("19.8");
		expect(formatChips("2.000000")).toBe("2");
		expect(formatChips("0.500000")).toBe("0.5");
		expect(formatChips("5")).toBe("5");
		expect(formatChips("")).toBe("0");
		expect(formatChips(undefined)).toBe("0");
	});
});

describe("describeRoomEvent", () => {
	it("narrates a betting action with the seat's handle", () => {
		expect(
			describeRoomEvent(
				event("action", { seat: 1, action: "raise", amount: "2.000000" }),
				seatName
			)
		).toEqual({
			seq: 1,
			text: "@alice raises 2",
			tone: "action",
		});
		expect(
			describeRoomEvent(event("action", { seat: 2, action: "fold" }), seatName)
				?.text
		).toBe("@bob folds");
		expect(
			describeRoomEvent(
				event("action", { seat: 1, action: "check", amount: "0" }),
				seatName
			)?.text
		).toBe("@alice checks");
	});

	it("narrates community cards with suit symbols", () => {
		expect(
			describeRoomEvent(
				event("community_cards", { street: "flop", cards: ["As", "Kh", "Td"] }),
				seatName
			)?.text
		).toBe("Flop: A♠ K♥ 10♦");
	});

	it("narrates the winner with a win tone", () => {
		const line = describeRoomEvent(
			event("hand_result", {
				winners: [{ seat: 1, agent: "@alice", payout: "19.800000" }],
			}),
			seatName
		);
		expect(line).toEqual({ seq: 1, text: "@alice wins 19.8", tone: "win" });
	});

	it("narrates hand start, showdown, and timeouts", () => {
		expect(
			describeRoomEvent(event("hand_start", { handNumber: 7 }), seatName)?.text
		).toBe("New hand #7 dealt");
		expect(
			describeRoomEvent(event("showdown", { players: [] }), seatName)?.text
		).toBe("Showdown — cards revealed");
		expect(
			describeRoomEvent(
				event("player_timeout", { seat: 2, action: "fold" }),
				seatName
			)?.text
		).toBe("@bob timed out (fold)");
	});

	it("returns undefined for non-narrated events", () => {
		expect(
			describeRoomEvent(event("action_required", { seat: 1 }), seatName)
		).toBeUndefined();
		expect(
			describeRoomEvent(event("pot_update", { main: "4.000000" }), seatName)
		).toBeUndefined();
	});
});
