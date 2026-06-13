import { beforeEach, describe, expect, it } from "vitest";
import type { Signer } from "@tinyhumansai/tinyplace";

import { useAuthStore } from "./auth";

/**
 * Guards the contract the domain-registration fix depends on: the auth store
 * must expose an `identitySigner` whose key derives the cryptoId. For a hot
 * session wallet that is the underlying wallet (grantor), not the session key —
 * otherwise registration signs with a key that does not match the cryptoId and
 * the backend rejects it with "publicKey does not derive cryptoId".
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

	it("keeps the wallet as identitySigner when a session key signs (hot session wallet)", () => {
		const wallet = fakeSigner("wallet");
		// The session signer reports the WALLET's agentId but its OWN public key.
		const session = {
			agentId: "wallet",
			publicKeyBase64: "pk-session",
		} as unknown as Signer;

		useAuthStore.getState().setSigner(session, session.agentId, wallet);

		const state = useAuthStore.getState();
		// Routine calls use the session key...
		expect(state.signer).toBe(session);
		// ...but identity-binding registration uses the wallet, whose public key
		// derives the cryptoId.
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
