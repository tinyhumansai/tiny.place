import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { FunctionComponent } from "@src/common/types";

import { X402ConfirmProvider } from "./X402ConfirmDialog";
import { useX402Confirm } from "./x402-confirm";

type HarnessProperties = {
	execute: () => Promise<unknown>;
};

function Harness({ execute }: HarnessProperties): FunctionComponent {
	const confirm = useX402Confirm();

	return (
		<button
			type="button"
			onClick={(): void => {
				void confirm(
					{
						title: "Buy identity",
						subject: "@seller",
						amount: "120000",
						asset: "USDC",
						recipient: "treasury-wallet",
						note: "The server returned an x402 challenge.",
						confirmLabel: "Buy",
					},
					execute
				).catch(() => {});
			}}
		>
			Start payment
		</button>
	);
}

function renderHarness(execute: () => Promise<unknown>): void {
	render(
		<X402ConfirmProvider isDark={false}>
			<Harness execute={execute} />
		</X402ConfirmProvider>
	);
}

describe("X402ConfirmProvider", () => {
	it("renders the 402 challenge details and success state", async () => {
		const user = userEvent.setup();
		const execute = vi.fn(() => Promise.resolve({ ledgerTxId: "tx_1" }));

		renderHarness(execute);
		await user.click(screen.getByRole("button", { name: "Start payment" }));

		const dialog = screen.getByRole("dialog");
		expect(dialog).toHaveTextContent("Buy identity");
		expect(dialog).toHaveTextContent("@seller");
		expect(dialog).toHaveTextContent("120000 USDC");
		expect(dialog).toHaveTextContent("treasury-wallet");
		expect(dialog).toHaveTextContent("The server returned an x402 challenge.");

		await user.click(screen.getByRole("button", { name: "Buy" }));

		await waitFor(() => {
			expect(execute).toHaveBeenCalledTimes(1);
		});
		expect(screen.getByText("Payment confirmed.")).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Done" }));
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});

	it("cancels before wallet signing", async () => {
		const user = userEvent.setup();
		const execute = vi.fn(() => Promise.resolve({ ledgerTxId: "tx_1" }));

		renderHarness(execute);
		await user.click(screen.getByRole("button", { name: "Start payment" }));
		await user.click(screen.getByRole("button", { name: "Cancel" }));

		expect(execute).not.toHaveBeenCalled();
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});

	it.each([
		["wallet rejection", "User rejected wallet signature."],
		["insufficient funds", "Insufficient funds for this payment."],
		["verifier rejection", "Payment verifier rejected the authorization."],
		["settlement failure", "Settlement transaction failed."],
		["duplicate nonce", "payment nonce already settled"],
	])("shows %s errors and lets the user retry", async (_name, message) => {
		const user = userEvent.setup();
		const execute = vi
			.fn<() => Promise<unknown>>()
			.mockRejectedValueOnce(new Error(message))
			.mockResolvedValueOnce({ ledgerTxId: "tx_retry" });

		renderHarness(execute);
		await user.click(screen.getByRole("button", { name: "Start payment" }));
		await user.click(screen.getByRole("button", { name: "Buy" }));

		await expect(screen.findByText(message)).resolves.toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();

		await user.click(screen.getByRole("button", { name: "Retry" }));

		await waitFor(() => {
			expect(execute).toHaveBeenCalledTimes(2);
		});
		expect(screen.getByText("Payment confirmed.")).toBeInTheDocument();
	});
});
