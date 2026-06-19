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
		const before = Date.now();

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
		expect(Date.parse(approved!.expiresAt)).toBeGreaterThanOrEqual(
			before + 7 * 24 * 60 * 60 * 1000 - 1_000
		);

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

	it("signs the one-time grant with the approval dialog but the persistent identity signer with the raw wallet signMessage", async () => {
		const wallet = await LocalSigner.fromSeed(new Uint8Array(32).fill(7));
		// Two distinct sign paths for the SAME wallet key: the dialog-wrapped
		// approver (one-time session grant) and the raw signMessage (everything the
		// identity signer does afterwards — registration, x402 payments).
		const approvalSigns: Array<string> = [];
		const rawSigns: Array<string> = [];
		const approveSignMessage = async (
			message: Uint8Array
		): Promise<Uint8Array> => {
			approvalSigns.push(new TextDecoder().decode(message));
			return wallet.sign(message);
		};
		const walletSignMessage = async (
			message: Uint8Array
		): Promise<Uint8Array> => {
			rawSigns.push(new TextDecoder().decode(message));
			return wallet.sign(message);
		};
		const client = {
			signers: {
				approve: vi.fn((authorization: X402Authorization) =>
					Promise.resolve({
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
					})
				),
			},
		} as unknown as TinyPlaceClient;

		const session = await SessionWalletSigner.establish(
			wallet.publicKey,
			walletSignMessage,
			client,
			approveSignMessage
		);

		// The grant approval went through the dialog signer, NOT the raw path.
		expect(approvalSigns).toHaveLength(1);
		expect(rawSigns).toHaveLength(0);

		// The identity signer (what DomainRegistration / x402 payments use) signs
		// through the RAW wallet signMessage — never re-rendering the session dialog.
		await session.walletSigner.sign(
			new TextEncoder().encode("register @alice")
		);
		expect(rawSigns).toEqual(["register @alice"]);
		expect(approvalSigns).toHaveLength(1);
	});
});
