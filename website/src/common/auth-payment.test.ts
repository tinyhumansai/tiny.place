import { beforeEach, describe, expect, it } from "vitest";
import { LocalSigner, Signer } from "@tinyhumansai/tinyplace";

import {
	setAuthSession,
	signX402ChallengeAuthorization,
	signX402ChallengePaymentMap,
	type X402ChallengePayment,
} from "./auth-payment";
import { useAuthStore } from "@src/store/auth";

class CachedAuthTokenSigner extends Signer {
	public readonly agentId = "cached-siws-wallet";
	public readonly publicKeyBase64 = "cached-siws-public-key";

	public sign(): Uint8Array {
		return new TextEncoder().encode("cached-siws-proof");
	}

	public getX25519KeyPair(): never {
		throw new Error("not used in auth-payment tests");
	}
}

describe("auth payment signing", () => {
	beforeEach(() => {
		useAuthStore.getState().clearSession();
	});

	it("standardizes x402 challenge defaults and signer metadata", async () => {
		const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(7));
		const authorization = await signX402ChallengeAuthorization({
			fallbackFrom: signer.agentId,
			metadata: { purpose: "test" },
			noncePrefix: "unit",
			payment: {
				scheme: "exact",
				network: "solana:mainnet",
				asset: "USDC",
				amount: "123",
				from: "",
				to: "treasury",
			},
			signer,
		});

		expect(authorization).toMatchObject({
			scheme: "exact",
			network: "solana:mainnet",
			asset: "USDC",
			amount: "123",
			from: signer.agentId,
			to: "treasury",
		});
		expect(authorization.expiresAt).not.toBe("");
		expect(authorization.nonce).toMatch(/^unit_/);
		expect(authorization.metadata).toMatchObject({
			publicKey: signer.publicKeyBase64,
			purpose: "test",
		});
		expect(authorization.signature).not.toBe("");
	});

	it("returns the backend payment-map shape", async () => {
		const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(8));
		const payment = await signX402ChallengePaymentMap({
			fallbackFrom: signer.agentId,
			noncePrefix: "map",
			payment: {
				scheme: "exact",
				network: "solana:mainnet",
				asset: "USDC",
				amount: "456",
				from: signer.agentId,
				to: "seller",
			},
			signer,
		});

		expect(payment).toMatchObject({
			scheme: "exact",
			network: "solana:mainnet",
			asset: "USDC",
			amount: "456",
			from: signer.agentId,
			to: "seller",
			"metadata.publicKey": signer.publicKeyBase64,
		});
		expect(payment["signature"]).not.toBe("");
	});

	it("defaults x402 signing to the direct identity signer, not the cached SIWS auth signer", async () => {
		const identity = await LocalSigner.fromSeed(new Uint8Array(32).fill(9));
		const apiAuth = new CachedAuthTokenSigner();
		const payment: X402ChallengePayment = {
			scheme: "exact",
			network: "solana:mainnet",
			asset: "USDC",
			amount: "789",
			from: identity.agentId,
			to: "seller",
			nonce: "fixed-nonce",
			expiresAt: "2026-06-18T12:05:00.000Z",
		};
		setAuthSession(apiAuth, identity);

		const defaultAuthorization = await signX402ChallengeAuthorization({
			fallbackFrom: identity.agentId,
			noncePrefix: "default",
			payment,
		});
		const identityAuthorization = await signX402ChallengeAuthorization({
			fallbackFrom: identity.agentId,
			noncePrefix: "identity",
			payment,
			signer: identity,
		});

		expect(defaultAuthorization.signature).toBe(
			identityAuthorization.signature
		);
		expect(defaultAuthorization.metadata).toMatchObject({
			publicKey: identity.publicKeyBase64,
		});
		expect(defaultAuthorization.signature).not.toBe(btoa("cached-siws-proof"));
	});
});
