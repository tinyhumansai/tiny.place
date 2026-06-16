// @vitest-environment node
import {
	TinyPlaceError,
	type AgentCard,
	type TinyPlaceClient,
} from "@tinyhumansai/tinyplace";
import { describe, expect, it, vi } from "vitest";

import {
	ENCRYPTION_PUBLIC_KEY_METADATA,
	publishEncryptionKey,
} from "./encryption-discovery";

const AGENT_ID = "61KcG5aGLqpnJz2fn4tujFKAdzqsdGR9XqiUeVoT3vPg";
const ENC_KEY = "B9LckBJOrJEncryptionPublicKeyBase64z6QEU=";

function makeUpsert(): ReturnType<
	typeof vi.fn<(id: string, card: AgentCard) => Promise<AgentCard>>
> {
	return vi.fn(
		(_id: string, card: AgentCard): Promise<AgentCard> => Promise.resolve(card)
	);
}

function clientWith(getAgent: () => Promise<AgentCard>): {
	client: TinyPlaceClient;
	upsert: ReturnType<typeof makeUpsert>;
} {
	const upsert = makeUpsert();
	const client = {
		directory: { getAgent: vi.fn(getAgent), upsertAgent: upsert },
	} as unknown as TinyPlaceClient;
	return { client, upsert };
}

describe("publishEncryptionKey", () => {
	it("creates a minimal card when the wallet has no agent card (404)", async () => {
		const { client, upsert } = clientWith(() => {
			throw new TinyPlaceError(404, { error: "not found" });
		});

		await publishEncryptionKey(client, AGENT_ID, ENC_KEY);

		expect(upsert).toHaveBeenCalledTimes(1);
		const card = upsert.mock.lastCall?.[1];
		expect(card?.agentId).toBe(AGENT_ID);
		expect(card?.name).toBe(AGENT_ID);
		expect(card?.cryptoId).toBe(AGENT_ID);
		expect(card?.metadata?.[ENCRYPTION_PUBLIC_KEY_METADATA]).toBe(ENC_KEY);
	});

	it("preserves an existing card and adds the encryption key", async () => {
		const existing: AgentCard = {
			agentId: AGENT_ID,
			name: "Atlas",
			cryptoId: AGENT_ID,
			metadata: { homepage: "https://example.com" },
			createdAt: "2026-01-01T00:00:00Z",
			updatedAt: "2026-01-01T00:00:00Z",
		};
		const { client, upsert } = clientWith(() => Promise.resolve(existing));

		await publishEncryptionKey(client, AGENT_ID, ENC_KEY);

		const card = upsert.mock.lastCall?.[1];
		expect(card?.name).toBe("Atlas");
		expect(card?.metadata?.["homepage"]).toBe("https://example.com");
		expect(card?.metadata?.[ENCRYPTION_PUBLIC_KEY_METADATA]).toBe(ENC_KEY);
	});

	it("is a no-op when the key is already advertised", async () => {
		const existing: AgentCard = {
			agentId: AGENT_ID,
			name: "Atlas",
			cryptoId: AGENT_ID,
			metadata: { [ENCRYPTION_PUBLIC_KEY_METADATA]: ENC_KEY },
			createdAt: "2026-01-01T00:00:00Z",
			updatedAt: "2026-01-01T00:00:00Z",
		};
		const { client, upsert } = clientWith(() => Promise.resolve(existing));

		await publishEncryptionKey(client, AGENT_ID, ENC_KEY);

		expect(upsert).not.toHaveBeenCalled();
	});

	it("rethrows non-404 errors", async () => {
		const { client } = clientWith(() => {
			throw new TinyPlaceError(500, { error: "boom" });
		});

		await expect(
			publishEncryptionKey(client, AGENT_ID, ENC_KEY)
		).rejects.toBeInstanceOf(TinyPlaceError);
	});
});
