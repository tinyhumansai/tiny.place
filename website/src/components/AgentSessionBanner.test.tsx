import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LocalSigner, createAgentLoginLink } from "@tinyhumansai/tinyplace";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "@src/common/i18n";
import { AgentSessionSigner } from "@src/common/agent-session";
import { useAuthStore } from "@src/store/auth";

import { AgentSessionBanner } from "./AgentSessionBanner";

const revoke = vi.fn(() => Promise.resolve({ status: "revoked" }));

vi.mock("@src/common/api-client", () => ({
	createClient: (): unknown => ({ signers: { revoke } }),
}));

/** Restores a real AgentSessionSigner so the exit path exercises revoke(). */
async function makeLinkSigner(seed: number): Promise<AgentSessionSigner> {
	const agent = await LocalSigner.fromSeed(new Uint8Array(32).fill(seed));
	const client = {
		signers: {
			approve: (): Promise<unknown> => Promise.resolve({ status: "active" }),
		},
	} as unknown as Parameters<typeof createAgentLoginLink>[0]["client"];
	const link = await createAgentLoginLink({ signer: agent, client });
	const signer = await AgentSessionSigner.fromFragment(link.token);
	if (!signer) throw new Error("expected a restorable link signer");
	return signer;
}

const originalLocation = window.location;

beforeEach(() => {
	revoke.mockClear();
	useAuthStore.getState().clearSession();
	// jsdom's window.location.assign is read-only; swap the whole object for a
	// stub so the banner's post-exit navigation is a no-op under test.
	Object.defineProperty(window, "location", {
		configurable: true,
		value: { ...originalLocation, assign: vi.fn() },
		writable: true,
	});
});

afterEach(() => {
	useAuthStore.getState().clearSession();
	Object.defineProperty(window, "location", {
		configurable: true,
		value: originalLocation,
		writable: true,
	});
	vi.restoreAllMocks();
});

describe("AgentSessionBanner", () => {
	it("renders nothing without a link session", () => {
		render(<AgentSessionBanner />);
		expect(screen.queryByRole("status")).toBeNull();
	});

	it("renders nothing for a normal (non-link) session", async () => {
		const wallet = await LocalSigner.fromSeed(new Uint8Array(32).fill(1));
		useAuthStore.getState().setSigner(wallet, wallet.agentId);
		render(<AgentSessionBanner />);
		expect(screen.queryByRole("status")).toBeNull();
	});

	it("shows a Viewing-as banner during a link session", async () => {
		const signer = await makeLinkSigner(41);
		useAuthStore.getState().setLinkSession(signer, signer.agentId);

		render(<AgentSessionBanner />);

		const banner = screen.getByRole("status");
		expect(banner).toBeInTheDocument();
		expect(banner.textContent).toContain("Viewing as");
	});

	it("exit revokes the grant and clears the session", async () => {
		const signer = await makeLinkSigner(42);
		useAuthStore.getState().setLinkSession(signer, signer.agentId);

		render(<AgentSessionBanner />);
		await userEvent.click(screen.getByRole("button", { name: /exit/i }));

		await waitFor(() => {
			expect(revoke).toHaveBeenCalledWith(signer.sessionKey, signer.agentId);
		});
		expect(useAuthStore.getState().agentLinkSession).toBe(false);
		expect(useAuthStore.getState().signer).toBeUndefined();
	});
});
