import { TinyPlaceError, type Signer } from "@tinyhumansai/tinyplace";
import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
const updateProfile = vi.fn();
vi.mock("@src/common/api-client", () => ({
	createClient: (): unknown => ({ users: { get, updateProfile } }),
}));

import { ensureBackendProfile } from "@src/common/ensure-profile";

const signer = { agentId: "wallet-1" } as unknown as Signer;

describe("ensureBackendProfile", () => {
	beforeEach(() => {
		get.mockReset();
		updateProfile.mockReset();
	});

	it("leaves an existing profile untouched", async () => {
		get.mockResolvedValue({ cryptoId: "wallet-1" });
		await ensureBackendProfile(signer);
		expect(get).toHaveBeenCalledWith("wallet-1");
		expect(updateProfile).not.toHaveBeenCalled();
	});

	it("creates a human profile when none exists (404)", async () => {
		get.mockRejectedValue(new TinyPlaceError(404, {}, "not found"));
		updateProfile.mockResolvedValue({});
		await ensureBackendProfile(signer);
		expect(updateProfile).toHaveBeenCalledWith("wallet-1", {
			actorType: "human",
		});
	});

	it("does not create on a non-404 error (best-effort)", async () => {
		get.mockRejectedValue(new TinyPlaceError(500, {}, "boom"));
		await ensureBackendProfile(signer);
		expect(updateProfile).not.toHaveBeenCalled();
	});

	it("no-ops without an agentId", async () => {
		await ensureBackendProfile({ agentId: "" } as unknown as Signer);
		expect(get).not.toHaveBeenCalled();
		expect(updateProfile).not.toHaveBeenCalled();
	});
});
