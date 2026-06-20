import { beforeEach, describe, expect, it } from "vitest";
import type { Signer } from "@tinyhumansai/tinyplace";

import { useAuthStore } from "./auth";

/**
 * Guards the contract the domain-registration fix depends on: the auth store
 * must expose an `identitySigner` whose key derives the cryptoId. It defaults to
 * the active signer, but an explicit identity signer can be supplied so identity
 * registration signs with the key that derives the cryptoId.
 */
function fakeSigner(id: string): Signer {
	return { agentId: id, publicKeyBase64: `pk-${id}` } as unknown as Signer;
}

describe("auth store identitySigner", () => {
	beforeEach(() => {
		useAuthStore.getState().clearSession();
	});

	it("defaults identitySigner to the signer itself (direct wallet)", () => {
		const wallet = fakeSigner("wallet");
		useAuthStore.getState().setSigner(wallet, wallet.agentId);

		const state = useAuthStore.getState();
		expect(state.signer).toBe(wallet);
		expect(state.identitySigner).toBe(wallet);
		expect(state.agentId).toBe("wallet");
	});

	it("keeps an explicit identitySigner distinct from the active signer", () => {
		const wallet = fakeSigner("wallet");
		// A signer that reports the WALLET's agentId but its OWN public key.
		const other = {
			agentId: "wallet",
			publicKeyBase64: "pk-other",
		} as unknown as Signer;

		useAuthStore.getState().setSigner(other, other.agentId, wallet);

		const state = useAuthStore.getState();
		// Routine calls use the active signer...
		expect(state.signer).toBe(other);
		// ...but identity-binding registration uses the explicit identity signer,
		// whose public key derives the cryptoId.
		expect(state.identitySigner).toBe(wallet);
		expect(state.identitySigner?.publicKeyBase64).toBe("pk-wallet");
		expect(state.signer?.publicKeyBase64).not.toBe(
			state.identitySigner?.publicKeyBase64
		);
	});

	it("clears identitySigner on session clear", () => {
		const wallet = fakeSigner("wallet");
		useAuthStore.getState().setSigner(wallet, wallet.agentId);
		useAuthStore.getState().clearSession();

		const state = useAuthStore.getState();
		expect(state.signer).toBeUndefined();
		expect(state.identitySigner).toBeUndefined();
		expect(state.agentId).toBeUndefined();
	});
});
