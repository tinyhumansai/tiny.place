// @vitest-environment node
import type {
	AgentCard,
	ResolveResponse,
	TinyPlaceClient,
} from "@tinyhumansai/tinyplace";
import { describe, expect, it, vi } from "vitest";

import { resolveDirectoryPeer } from "./peer-resolution";

const CRYPTO_ID = "57mjBDibe6f6Vqv9uvhB6nckcz6cKwSCqt4Lio1DawJh";
const ENC_KEY = "WM8smAepeXnyL8+36sM0I3a/dfE5RkxJ66w3eXIrOSM=";
const WALLET_KEY = "Mvzw9tEbDl4wl36Z5Yhg83IQTMwyzB8AWgBkf2EMjKw=";

function clientWith(directory: Partial<TinyPlaceClient["directory"]>): {
	client: TinyPlaceClient;
	getAgent: ReturnType<typeof vi.fn>;
	resolve: ReturnType<typeof vi.fn>;
} {
	const getAgent = vi.fn(directory.getAgent);
	const resolve = vi.fn(directory.resolve);
	const client = {
		directory: { getAgent, resolve },
	} as unknown as TinyPlaceClient;
	return { client, getAgent, resolve };
}

describe("resolveDirectoryPeer", () => {
	it("resolves a base58 cryptoId via getAgent and prefers the advertised encryption key", async () => {
		const card: AgentCard = {
			agentId: CRYPTO_ID,
			publicKey: WALLET_KEY,
			metadata: { encryptionPublicKey: ENC_KEY },
		} as unknown as AgentCard;
		const { client, getAgent, resolve } = clientWith({
			getAgent: () => Promise.resolve(card),
		});

		const peer = await resolveDirectoryPeer(client, CRYPTO_ID);

		expect(getAgent).toHaveBeenCalledWith(CRYPTO_ID);
		expect(resolve).not.toHaveBeenCalled();
		expect(peer).toEqual({ address: ENC_KEY, agentId: CRYPTO_ID });
	});

	it("resolves a @handle via directory.resolve, then fetches the card by cryptoId", async () => {
		// The resolve endpoint returns the identity but not the full agent card,
		// so the card must be fetched by cryptoId to pick up the encryption key.
		const { client, getAgent, resolve } = clientWith({
			resolve: () =>
				Promise.resolve({
					identity: { cryptoId: CRYPTO_ID, username: "@openclawtest" },
				} as unknown as ResolveResponse),
			getAgent: () =>
				Promise.resolve({
					agentId: CRYPTO_ID,
					publicKey: WALLET_KEY,
					username: "@openclawtest",
					metadata: { encryptionPublicKey: ENC_KEY },
				} as unknown as AgentCard),
		});

		const peer = await resolveDirectoryPeer(client, "@openclawtest");

		expect(resolve).toHaveBeenCalledWith("@openclawtest");
		expect(getAgent).toHaveBeenCalledWith(CRYPTO_ID);
		expect(peer).toEqual({
			address: ENC_KEY,
			agentId: CRYPTO_ID,
			username: "@openclawtest",
		});
	});

	it("uses the agent card embedded in the resolve response when present", async () => {
		const { client, getAgent, resolve } = clientWith({
			resolve: () =>
				Promise.resolve({
					identity: { cryptoId: CRYPTO_ID, username: "@openclawtest" },
					agent: {
						agentId: CRYPTO_ID,
						publicKey: WALLET_KEY,
						username: "@openclawtest",
						metadata: { encryptionPublicKey: ENC_KEY },
					},
				} as unknown as ResolveResponse),
		});

		const peer = await resolveDirectoryPeer(client, "@openclawtest");

		expect(resolve).toHaveBeenCalledWith("@openclawtest");
		expect(getAgent).not.toHaveBeenCalled();
		expect(peer.address).toBe(ENC_KEY);
	});

	it("falls back to the card's own publicKey when no encryption key is advertised", async () => {
		const { client } = clientWith({
			getAgent: () =>
				Promise.resolve({
					agentId: CRYPTO_ID,
					publicKey: WALLET_KEY,
				} as unknown as AgentCard),
		});

		const peer = await resolveDirectoryPeer(client, CRYPTO_ID);

		expect(peer.address).toBe(WALLET_KEY);
	});

	it("falls back to the identity's username when the card has none", async () => {
		const { client } = clientWith({
			resolve: () =>
				Promise.resolve({
					identity: { cryptoId: CRYPTO_ID, username: "@openclawtest" },
				} as unknown as ResolveResponse),
			getAgent: () =>
				Promise.resolve({
					agentId: CRYPTO_ID,
					publicKey: WALLET_KEY,
					metadata: { encryptionPublicKey: ENC_KEY },
				} as unknown as AgentCard),
		});

		const peer = await resolveDirectoryPeer(client, "@openclawtest");

		expect(peer.username).toBe("@openclawtest");
	});

	it("throws when a handle cannot be resolved to a cryptoId", async () => {
		const { client } = clientWith({
			resolve: () =>
				Promise.resolve({ identity: null } as unknown as ResolveResponse),
		});

		await expect(resolveDirectoryPeer(client, "@ghost")).rejects.toThrow(
			/Could not resolve @ghost/
		);
	});
});
