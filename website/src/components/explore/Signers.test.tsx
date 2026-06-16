import type { Signer, SignerApproval } from "@tinyhumansai/tinyplace";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAuthStore } from "@src/store/auth";

import { Signers } from "./Signers";

const useApprovedSigners = vi.hoisted(() => vi.fn());
const useRevokeSigner = vi.hoisted(() => vi.fn());
const revokeMutate = vi.hoisted(() => vi.fn());

vi.mock("@src/hooks/use-signers", () => ({
	useApprovedSigners: (): unknown => useApprovedSigners(),
	useRevokeSigner: (): unknown => useRevokeSigner(),
}));

function fakeSigner(): Signer {
	return {
		agentId: "wallet-agent",
		publicKeyBase64: "wallet-public-key",
	} as Signer;
}

function approval(overrides: Partial<SignerApproval> = {}): SignerApproval {
	return {
		signerKey: "session-key-active-123456",
		grantor: "wallet-agent",
		network: "solana:mainnet",
		asset: "USDC",
		budget: "100000000",
		spent: "25000000",
		remaining: "75000000",
		expiresAt: "2026-06-20T00:00:00.000Z",
		nonce: "signer_nonce",
		status: "active",
		createdAt: "2026-06-15T00:00:00.000Z",
		...overrides,
	};
}

beforeEach(() => {
	useAuthStore.getState().clearSession();
	useApprovedSigners.mockReset();
	useRevokeSigner.mockReset();
	revokeMutate.mockReset();
	useRevokeSigner.mockReturnValue({
		isError: false,
		isPending: false,
		mutate: revokeMutate,
	});
});

describe("Signers", () => {
	it("prompts disconnected users to connect before managing approvals", () => {
		useApprovedSigners.mockReturnValue({
			data: undefined,
			isError: false,
			isLoading: false,
		});

		render(<Signers isDark={false} />);

		expect(
			screen.getByText("Connect your wallet to manage approved signers.")
		).toBeInTheDocument();
		expect(useApprovedSigners).toHaveBeenCalledTimes(1);
	});

	it("shows bounded, budget-decrementing approvals and revokes active sessions", async () => {
		const user = userEvent.setup();
		useAuthStore.getState().setSigner(fakeSigner(), "wallet-agent");
		useApprovedSigners.mockReturnValue({
			data: {
				signers: [
					approval(),
					approval({
						signerKey: "session-key-revoked-123456",
						spent: "100000000",
						remaining: "0",
						status: "revoked",
					}),
				],
			},
			isError: false,
			isLoading: false,
		});

		render(<Signers isDark={false} />);

		expect(screen.getByText("Approved Wallet Signers")).toBeInTheDocument();
		expect(
			screen.getByText(
				"Session keys that can authorize payments against a signed budget."
			)
		).toBeInTheDocument();
		expect(screen.getAllByText("solana:mainnet / USDC")).toHaveLength(2);
		expect(screen.getAllByText("Budget")).toHaveLength(2);
		expect(screen.getAllByText("Spent")).toHaveLength(2);
		expect(screen.getAllByText("Remaining")).toHaveLength(2);
		expect(screen.getAllByText("100000000")).toHaveLength(3);
		expect(screen.getByText("25000000")).toBeInTheDocument();
		expect(screen.getByText("75000000")).toBeInTheDocument();
		expect(screen.getAllByText("0")).toHaveLength(1);

		const revokeButtons = screen.getAllByRole("button", { name: "Revoke" });
		expect(revokeButtons[0]).toBeEnabled();
		expect(revokeButtons[1]).toBeDisabled();

		await user.click(revokeButtons[0]!);

		expect(revokeMutate).toHaveBeenCalledWith("session-key-active-123456");
	});
});
