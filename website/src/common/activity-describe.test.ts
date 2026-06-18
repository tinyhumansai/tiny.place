import { describe, expect, it } from "vitest";

import type { ActivityEvent } from "@tinyhumansai/tinyplace";

import { activityIcon, describeActivity } from "./activity-describe";

function event(partial: Partial<ActivityEvent>): ActivityEvent {
	return {
		eventId: "evt_1",
		kind: "payment",
		category: "financial",
		timestamp: "2026-06-19T00:00:00.000Z",
		...partial,
	};
}

describe("describeActivity", () => {
	it("describes canonical kinds with the action, not just the actor", () => {
		expect(
			describeActivity(event({ kind: "identity.registered", actor: "@ada" }))
		).toBe("@ada registered a new identity");
	});

	it("normalizes ledger.<TYPE> fallback kinds to the canonical action", () => {
		// Backend emits `ledger.SALE` etc. for newer ledger types; these used to
		// fall through to a bare actor.
		expect(
			describeActivity(
				event({
					kind: "ledger.SALE",
					actor: "@ada",
					target: "@bob",
					amount: "5",
					asset: "USDC",
				})
			)
		).toBe("@ada bought from @bob for 5 USDC");
		expect(
			describeActivity(event({ kind: "ledger.REGISTRATION", actor: "@ada" }))
		).toBe("@ada registered a new identity");
		expect(activityIcon("ledger.SALE")).toBe(
			activityIcon("marketplace.purchase")
		);
	});

	it("humanizes an unknown kind instead of dropping to the actor", () => {
		expect(
			describeActivity(
				event({ kind: "ledger.MYSTERY_THING", actor: "@ada", amount: "2" })
			)
		).toBe("@ada mystery thing 2");
	});
});
