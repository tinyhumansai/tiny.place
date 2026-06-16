import { describe, expect, it } from "vitest";
import { LocalSigner } from "@tinyhumansai/tinyplace";

import {
	signX402ChallengeAuthorization,
	signX402ChallengePaymentMap,
} from "./auth-payment";

describe("auth payment signing", () => {
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
});
