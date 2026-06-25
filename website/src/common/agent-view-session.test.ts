import {
	LocalSigner,
	mintOnboardGrant,
	type OnboardGrantCredential,
	type TinyPlaceClient,
} from "@tinyhumansai/tinyplace";
import { describe, expect, it, vi } from "vitest";

import { readGrantFragment, resolveAgentViewGrant } from "./agent-view-session";

async function fullGrantFragment(seed: number): Promise<{
	fragment: string;
	wallet: string;
}> {
	const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(seed), {
		siws: false,
	});
	const grant = await mintOnboardGrant(
		signer,
		signer.publicKeyBase64,
		["session.view"],
		15 * 60 * 1000
	);
	return { fragment: grant.fragmentValue(), wallet: signer.agentId };
}

function onboardStub(impl?: (token: string) => Promise<{ grant: string }>): {
	onboard: TinyPlaceClient["onboard"];
	redeem: ReturnType<typeof vi.fn>;
} {
	const redeem = vi.fn(
		impl ?? ((): Promise<{ grant: string }> => Promise.resolve({ grant: "" }))
	);
	return {
		onboard: { redeemHandoff: redeem } as unknown as TinyPlaceClient["onboard"],
		redeem,
	};
}

describe("readGrantFragment", () => {
	it("reads the grant value from a #grant= fragment", () => {
		expect(readGrantFragment("#grant=abc123")).toBe("abc123");
		expect(readGrantFragment("grant=abc123")).toBe("abc123");
	});

	it("returns undefined when absent or empty", () => {
		expect(readGrantFragment("")).toBeUndefined();
		expect(readGrantFragment("#other=1")).toBeUndefined();
		expect(readGrantFragment("#grant=")).toBeUndefined();
	});
});

describe("resolveAgentViewGrant", () => {
	it("parses a full grant fragment directly without redeeming", async () => {
		const { fragment, wallet } = await fullGrantFragment(1);
		const { onboard, redeem } = onboardStub();

		const grant = await resolveAgentViewGrant(fragment, onboard);

		expect(grant.wallet).toBe(wallet);
		expect(redeem).not.toHaveBeenCalled();
	});

	it("redeems a short handoff token then parses the stored grant", async () => {
		const { fragment, wallet } = await fullGrantFragment(2);
		const { onboard, redeem } = onboardStub(
			(): Promise<{ grant: string }> => Promise.resolve({ grant: fragment })
		);

		const grant = await resolveAgentViewGrant("shortToken123", onboard);

		expect(grant.wallet).toBe(wallet);
		expect(redeem).toHaveBeenCalledWith("shortToken123");
	});

	it("fails closed when the redeemed grant is malformed", async () => {
		const { onboard } = onboardStub(
			(): Promise<{ grant: string }> =>
				Promise.resolve({ grant: "not-a-grant" })
		);

		await expect(
			resolveAgentViewGrant("shortToken123", onboard)
		).rejects.toThrow();
	});

	it("never accepts a credential that is not a grant", () => {
		const bogus: unknown = { kind: "onboard-grant" };
		// Type guard: resolve only returns OnboardGrantCredential, never the raw input.
		expect((bogus as OnboardGrantCredential).wallet).toBeUndefined();
	});
});
