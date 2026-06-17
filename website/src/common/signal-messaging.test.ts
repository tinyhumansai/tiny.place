import type { KeyBundle, TinyPlaceClient } from "@tinyhumansai/tinyplace";
import { describe, expect, it, vi } from "vitest";

import { verifyKeyBundlePublished } from "./signal-messaging";

const ADDRESS = "Zm9vYmFy";

function clientReturning(
	getBundle: (agentId: string) => Promise<KeyBundle>
): TinyPlaceClient {
	return {
		keys: { getBundle: vi.fn(getBundle) },
	} as unknown as TinyPlaceClient;
}

function bundle(signedPreKeyPublicKey: string | undefined): KeyBundle {
	return {
		agentId: ADDRESS,
		identityKey: ADDRESS,
		signedPreKey: signedPreKeyPublicKey
			? { keyId: "spk_1", publicKey: signedPreKeyPublicKey }
			: ({ keyId: "spk_1" } as KeyBundle["signedPreKey"]),
		updatedAt: "2026-01-01T00:00:00.000Z",
	};
}

describe("verifyKeyBundlePublished", () => {
	it("resolves and probes the relay when the bundle landed with a signed pre-key", async () => {
		const getBundle = vi.fn(
			(): Promise<KeyBundle> => Promise.resolve(bundle("c2lnbmVk"))
		);
		const client = clientReturning(getBundle);

		await expect(
			verifyKeyBundlePublished(client, ADDRESS)
		).resolves.toBeUndefined();
		expect(getBundle).toHaveBeenCalledWith(ADDRESS);
	});

	it("rejects when the relay has no bundle (404 surfaces as a throw)", async () => {
		const client = clientReturning(
			(): Promise<KeyBundle> =>
				Promise.reject(new Error("Request failed with status 404"))
		);

		await expect(verifyKeyBundlePublished(client, ADDRESS)).rejects.toThrow(
			"404"
		);
	});

	it("rejects when a bundle exists but carries no usable signed pre-key", async () => {
		const client = clientReturning(
			(): Promise<KeyBundle> => Promise.resolve(bundle(undefined))
		);

		await expect(verifyKeyBundlePublished(client, ADDRESS)).rejects.toThrow(
			"did not land on the relay"
		);
	});
});
