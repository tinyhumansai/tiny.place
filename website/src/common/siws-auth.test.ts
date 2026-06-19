import { LocalSigner } from "@tinyhumansai/tinyplace";
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

function decodeProof(bytes: Uint8Array): Record<string, unknown> {
	const token = new TextDecoder().decode(bytes);
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
		expect(decodeProof(first.sign(new Uint8Array([1])))).toEqual(
			decodeProof(second.sign(new Uint8Array([2])))
		);
		expect(decodeProof(first.sign(new Uint8Array([3])))).toMatchObject({
			signature: expect.any(String) as string,
			signatureType: "ed25519",
			signedMessage: expect.any(String) as string,
		});
		const stored = JSON.parse(
			storage.getItem(`tinyplace:siws:${wallet.agentId}`) ?? "{}"
		) as { expiresAt?: string };
		expect(Date.parse(stored.expiresAt ?? "")).toBe(
			now + 7 * 24 * 60 * 60 * 1000
		);
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
