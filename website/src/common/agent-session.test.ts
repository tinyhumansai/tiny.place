import {
	LocalSigner,
	createAgentLoginLink,
	type TinyPlaceClient,
	type X402Authorization,
} from "@tinyhumansai/tinyplace";
import { describe, expect, it, vi } from "vitest";

import { AgentSessionSigner, restoreAgentLinkSession } from "./agent-session";

/** Mints a real view-as-agent link for `agentSeed`, returning the link + agent. */
async function mintLink(
	agentSeed: number,
	scope?: { budget?: string },
): Promise<{ token: string; agent: LocalSigner; signerKey: string }> {
	const agent = await LocalSigner.fromSeed(new Uint8Array(32).fill(agentSeed));
	const client = {
		signers: {
			approve: vi.fn((authorization: X402Authorization) =>
				Promise.resolve({ status: "active", signerKey: authorization.nonce }),
			),
		},
	} as unknown as Parameters<typeof createAgentLoginLink>[0]["client"];
	const link = await createAgentLoginLink({ signer: agent, client, scope });
	return { token: link.token, agent, signerKey: link.decoded.signerKey };
}

describe("AgentSessionSigner", () => {
	it("restores a signer from a fresh link fragment with no wallet", async () => {
		const { token, agent, signerKey } = await mintLink(21);

		const signer = await AgentSessionSigner.fromFragment(`#${token}`);

		expect(signer).toBeDefined();
		// It operates AS the agent...
		expect(signer!.agentId).toBe(agent.agentId);
		expect(signer!.identityPublicKeyBase64).toBe(agent.publicKeyBase64);
		// ...while signing with the delegated session key.
		expect(signer!.publicKeyBase64).not.toBe(agent.publicKeyBase64);
		expect(signer!.sessionKey).toBe(signerKey);

		const sig = await signer!.sign(new TextEncoder().encode("hi"));
		expect(sig.length).toBe(64);
	});

	it("exposes x402 metadata binding the session key to the agent grant", async () => {
		const { token } = await mintLink(22);
		const signer = (await AgentSessionSigner.fromFragment(token))!;

		const metadata = signer.x402PaymentMetadata();
		expect(metadata["publicKey"]).toBe(signer.publicKeyBase64);
		expect(metadata["parentNonce"]).toBeTruthy();
	});

	it("fails closed on malformed and wrong-version tokens", async () => {
		expect(await AgentSessionSigner.fromFragment("")).toBeUndefined();
		expect(await AgentSessionSigner.fromFragment("#")).toBeUndefined();
		expect(await AgentSessionSigner.fromFragment("garbage")).toBeUndefined();
		expect(await AgentSessionSigner.fromFragment("al9.abc")).toBeUndefined();
	});

	it("fails closed on an expired link", async () => {
		const { token } = await mintLink(23);
		// The link's expiry is minutes from real-now; move now far into the future
		// (well past any default TTL) so the token reads as expired.
		const future = Date.now() + 365 * 24 * 60 * 60 * 1000;
		vi.spyOn(Date, "now").mockReturnValue(future);
		try {
			const signer = await AgentSessionSigner.fromFragment(token);
			expect(signer).toBeUndefined();
		} finally {
			vi.restoreAllMocks();
		}
	});

	it("backendConfirmsActive is true only for an active grant", async () => {
		const { token, signerKey } = await mintLink(24);
		const signer = (await AgentSessionSigner.fromFragment(token))!;

		const get = vi.fn((key: string) =>
			Promise.resolve({ signerKey: key, status: "active" }),
		);
		const createActive = (): TinyPlaceClient =>
			({ signers: { get } }) as unknown as TinyPlaceClient;

		expect(await signer.backendConfirmsActive(createActive)).toBe(true);
		expect(get).toHaveBeenCalledWith(signerKey, signer.agentId);
	});

	it("backendConfirmsActive fails closed on revoked grant and on errors", async () => {
		const { token } = await mintLink(25);
		const signer = (await AgentSessionSigner.fromFragment(token))!;

		const revoked = (): TinyPlaceClient =>
			({
				signers: { get: () => Promise.resolve({ status: "revoked" }) },
			}) as unknown as TinyPlaceClient;
		expect(await signer.backendConfirmsActive(revoked)).toBe(false);

		const throws = (): TinyPlaceClient =>
			({
				signers: { get: () => Promise.reject(new Error("403")) },
			}) as unknown as TinyPlaceClient;
		expect(await signer.backendConfirmsActive(throws)).toBe(false);
	});
});

describe("restoreAgentLinkSession", () => {
	const activeClient = (): TinyPlaceClient =>
		({
			signers: { get: () => Promise.resolve({ status: "active" }) },
		}) as unknown as TinyPlaceClient;

	it("returns ok with a signer for a fresh, active link", async () => {
		const { token, agent } = await mintLink(31);

		const result = await restoreAgentLinkSession(`#${token}`, activeClient);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.agentId).toBe(agent.agentId);
			expect(result.signer).toBeInstanceOf(AgentSessionSigner);
		}
	});

	it("reports malformed without touching the backend", async () => {
		const get = vi.fn();
		const client = (): TinyPlaceClient =>
			({ signers: { get } }) as unknown as TinyPlaceClient;

		const result = await restoreAgentLinkSession("garbage", client);

		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.reason).toBe("malformed");
		expect(get).not.toHaveBeenCalled();
	});

	it("reports revoked when the backend says the grant is inactive", async () => {
		const { token } = await mintLink(32);
		const revokedClient = (): TinyPlaceClient =>
			({
				signers: { get: () => Promise.resolve({ status: "revoked" }) },
			}) as unknown as TinyPlaceClient;

		const result = await restoreAgentLinkSession(token, revokedClient);

		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.reason).toBe("revoked");
	});

	it("reports expired for a past-TTL link without a backend round-trip", async () => {
		const { token } = await mintLink(33);
		const get = vi.fn();
		const client = (): TinyPlaceClient =>
			({ signers: { get } }) as unknown as TinyPlaceClient;
		const future = Date.now() + 365 * 24 * 60 * 60 * 1000;
		vi.spyOn(Date, "now").mockReturnValue(future);
		try {
			const result = await restoreAgentLinkSession(token, client);
			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.reason).toBe("expired");
			expect(get).not.toHaveBeenCalled();
		} finally {
			vi.restoreAllMocks();
		}
	});
});
