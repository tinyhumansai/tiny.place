import {
	LocalSigner,
	SOLANA_MAINNET_NETWORK,
	type TinyPlaceClient,
	type X402Authorization,
} from "@tinyhumansai/tinyplace";
import { describe, expect, it, vi } from "vitest";

import { SessionWalletSigner } from "./session-wallet";

function parseCanonical(message: string): {
	amount: string;
	asset: string;
	expiresAt: string;
	from: string;
	metadata: Array<{ key: string; value: string }>;
	network: string;
	nonce: string;
	scheme: string;
	to: string;
} {
	return JSON.parse(message) as {
		amount: string;
		asset: string;
		expiresAt: string;
		from: string;
		metadata: Array<{ key: string; value: string }>;
		network: string;
		nonce: string;
		scheme: string;
		to: string;
	};
}

function metadataRecord(
	metadata: Array<{ key: string; value: string }>
): Record<string, string> {
	return Object.fromEntries(metadata.map(({ key, value }) => [key, value]));
}

describe("SessionWalletSigner", () => {
	it("establishes a bounded session grant without replacing the wallet identity key", async () => {
		const wallet = await LocalSigner.fromSeed(new Uint8Array(32).fill(16));
		const signedMessages: Array<string> = [];
		let approved: X402Authorization | undefined;
		const approve = vi.fn((authorization: X402Authorization) => {
			approved = authorization;
			return Promise.resolve({
				signerKey: "session-key",
				grantor: wallet.agentId,
				network: authorization.network,
				asset: authorization.asset,
				budget: authorization.amount,
				spent: "0",
				remaining: authorization.amount,
				expiresAt: authorization.expiresAt,
				nonce: authorization.nonce,
				status: "active",
				createdAt: "2026-06-15T00:00:00.000Z",
			});
		});
		const client = {
			signers: {
				approve,
			},
		} as unknown as TinyPlaceClient;

		const session = await SessionWalletSigner.establish(
			wallet.publicKey,
			async (message): Promise<Uint8Array> => {
				signedMessages.push(new TextDecoder().decode(message));
				return wallet.sign(message);
			},
			client
		);

		expect(approve).toHaveBeenCalledTimes(1);
		expect(approved).toBeDefined();
		expect(approved).toMatchObject({
			scheme: "upto",
			network: SOLANA_MAINNET_NETWORK,
			asset: "USDC",
			amount: "100000000",
			from: wallet.agentId,
			to: "",
		});
		expect(approved!.nonce).toMatch(/^signer_/);
		expect(Date.parse(approved!.expiresAt)).toBeGreaterThan(Date.now());

		const canonical = parseCanonical(signedMessages[0]!);
		expect(canonical).toMatchObject({
			scheme: "upto",
			network: SOLANA_MAINNET_NETWORK,
			asset: "USDC",
			amount: "100000000",
			from: wallet.agentId,
			to: "",
			nonce: approved!.nonce,
			expiresAt: approved!.expiresAt,
		});
		expect(metadataRecord(canonical.metadata)).toEqual({
			domain: "tiny.place",
			publicKey: wallet.publicKeyBase64,
			signerKey: session.sessionKey,
		});

		expect(session.agentId).toBe(wallet.agentId);
		expect(session.walletSigner.publicKeyBase64).toBe(wallet.publicKeyBase64);
		expect(session.identityPublicKeyBase64).toBe(wallet.publicKeyBase64);
		expect(session.publicKeyBase64).not.toBe(wallet.publicKeyBase64);
		expect(session.x402PaymentMetadata()).toEqual({
			publicKey: session.publicKeyBase64,
			parentNonce: approved!.nonce,
		});
	});
});
