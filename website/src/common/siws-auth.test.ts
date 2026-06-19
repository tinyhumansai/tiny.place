import {
	LocalSigner,
	buildCanonicalMessage,
	signX402Authorization,
} from "@tinyhumansai/tinyplace";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SiwsProofSigner } from "./siws-auth";

function memoryStorage(): Storage {
	const values = new Map<string, string>();
	return {
		get length(): number {
			return values.size;
		},
		clear: (): void => {
			values.clear();
		},
		getItem: (key: string): string | null => values.get(key) ?? null,
		key: (index: number): string | null =>
			Array.from(values.keys())[index] ?? null,
		removeItem: (key: string): void => {
			values.delete(key);
		},
		setItem: (key: string, value: string): void => {
			values.set(key, value);
		},
	};
}

function decodeProof(value: Uint8Array | string): Record<string, unknown> {
	const token =
		typeof value === "string" ? value : new TextDecoder().decode(value);
	const encoded = token.replace(/^siws:/u, "");
	const padded = encoded.padEnd(
		encoded.length + ((4 - (encoded.length % 4)) % 4),
		"="
	);
	return JSON.parse(
		atob(padded.replace(/-/g, "+").replace(/_/g, "/"))
	) as Record<string, unknown>;
}

describe("SiwsProofSigner", () => {
	let storage: Storage;

	beforeEach(() => {
		storage = memoryStorage();
	});

	it("caches and reuses a Sign-In-With-Solana proof for website API auth", async () => {
		const wallet = await LocalSigner.fromSeed(new Uint8Array(32).fill(3));
		const signMessage = vi.fn(async (data: Uint8Array) => wallet.sign(data));
		const now = Date.parse("2026-06-18T12:00:00.000Z");

		const first = await SiwsProofSigner.createOrRestore(
			wallet.publicKey,
			signMessage,
			{ now: () => now, storage }
		);
		const second = await SiwsProofSigner.createOrRestore(
			wallet.publicKey,
			signMessage,
			{ now: () => now + 1_000, storage }
		);

		expect(signMessage).toHaveBeenCalledTimes(1);
		expect(first.agentId).toBe(wallet.agentId);
		expect(second.agentId).toBe(wallet.agentId);
		// Request auth uses the cached SIWS token (via siwsSignature()).
		expect(decodeProof(first.siwsSignature())).toEqual(
			decodeProof(second.siwsSignature())
		);
		expect(decodeProof(first.siwsSignature())).toMatchObject({
			signature: expect.any(String) as string,
			signatureType: "ed25519",
			signedMessage: expect.any(String) as string,
		});
		// sign() delegates a REAL wallet signature (used for x402 payments), not
		// the SIWS token.
		const realSignature = await first.sign(new Uint8Array([3]));
		expect(realSignature).toBeInstanceOf(Uint8Array);
		expect(realSignature.length).toBe(64);
		const stored = JSON.parse(
			storage.getItem(`tinyplace:siws:${wallet.agentId}`) ?? "{}"
		) as { expiresAt?: string };
		expect(Date.parse(stored.expiresAt ?? "")).toBe(
			now + 7 * 24 * 60 * 60 * 1000
		);
	});

	it("signs x402 authorizations with a real wallet signature, not the SIWS token", async () => {
		const wallet = await LocalSigner.fromSeed(new Uint8Array(32).fill(5));
		const signMessage = vi.fn(async (data: Uint8Array) => wallet.sign(data));
		const signer = await SiwsProofSigner.createOrRestore(
			wallet.publicKey,
			signMessage,
			{ storage }
		);

		const fields = {
			scheme: "exact" as const,
			network: "solana:test",
			asset: "USDC",
			amount: "1000",
			from: wallet.agentId,
			to: "treasury",
			nonce: "pay_test",
			expiresAt: "2026-06-19T09:00:00.000Z",
			metadata: { domain: "tiny.place" },
		};
		const authorization = await signX402Authorization(signer, fields);

		// The payment signature must be a real Ed25519 signature over the canonical
		// message — verifiable against the wallet key — not a `siws:` proof token.
		expect(authorization.signature.startsWith("siws:")).toBe(false);
		const signatureBytes = Uint8Array.from(atob(authorization.signature), (c) =>
			c.charCodeAt(0)
		);
		const messageBytes = new TextEncoder().encode(
			buildCanonicalMessage(fields)
		);
		const verifyKey = await crypto.subtle.importKey(
			"raw",
			new Uint8Array(wallet.publicKey),
			{ name: "Ed25519" },
			false,
			["verify"]
		);
		const verified = await crypto.subtle.verify(
			"Ed25519",
			verifyKey,
			signatureBytes,
			messageBytes
		);
		expect(verified).toBe(true);
	});

	it("refreshes the proof after expiry", async () => {
		const wallet = await LocalSigner.fromSeed(new Uint8Array(32).fill(4));
		const signMessage = vi.fn(async (data: Uint8Array) => wallet.sign(data));
		const now = Date.parse("2026-06-18T12:00:00.000Z");

		await SiwsProofSigner.createOrRestore(wallet.publicKey, signMessage, {
			now: () => now,
			storage,
		});
		await SiwsProofSigner.createOrRestore(wallet.publicKey, signMessage, {
			now: () => now + 8 * 24 * 60 * 60 * 1000,
			storage,
		});

		expect(signMessage).toHaveBeenCalledTimes(2);
	});
});
