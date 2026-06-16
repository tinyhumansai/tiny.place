import type { Signer } from "@tinyhumansai/tinyplace";
import { describe, expect, it, vi } from "vitest";

import type { X402ChallengePayment } from "@src/common/auth-payment";
import type { X402ConfirmRequest } from "@src/components/explore/x402-confirm";

import { confirmAndSettleX402 } from "./x402-settle";

// Stub the signing step so the test exercises only the orchestration (sign then
// submit, optionally inside the confirm dialog).
vi.mock("@src/common/auth-payment", () => ({
	signX402ChallengePaymentMap: vi
		.fn<() => Promise<Record<string, string>>>()
		.mockResolvedValue({ signed: "yes" }),
}));

const basePayment: X402ChallengePayment = {
	scheme: "exact",
	network: "solana",
	asset: "USDC",
	amount: "5",
	from: "",
	to: "treasury",
	metadata: {},
};

const signer = {} as Signer;

describe("confirmAndSettleX402", () => {
	it("signs then submits and returns the settled result when no dialog is set", async () => {
		const submit = vi
			.fn<(p: Record<string, string>) => Promise<Record<string, string>>>()
			.mockImplementation((payment) => Promise.resolve(payment));

		const result = await confirmAndSettleX402({
			payment: basePayment,
			signer,
			fallbackFrom: "wallet",
			noncePrefix: "test",
			submit,
		});

		expect(submit).toHaveBeenCalledWith({ signed: "yes" });
		expect(result).toEqual({ signed: "yes" });
	});

	it("runs sign+submit INSIDE the dialog action, so the dialog only resolves after settlement", async () => {
		const submit = vi.fn<() => Promise<string>>().mockResolvedValue("settled");

		const confirmX402 = vi.fn(
			(_request: X402ConfirmRequest, execute: () => Promise<unknown>) => {
				// The dialog is shown but the payment has NOT been submitted yet:
				// submit runs only when the dialog invokes execute (user confirms).
				expect(submit).not.toHaveBeenCalled();
				return execute();
			}
		);

		const result = await confirmAndSettleX402({
			payment: basePayment,
			signer,
			fallbackFrom: "wallet",
			noncePrefix: "test",
			submit,
			confirmX402,
			confirmRequest: { title: "Pay", subject: "thing" },
		});

		expect(confirmX402).toHaveBeenCalledTimes(1);
		expect(submit).toHaveBeenCalledTimes(1);
		expect(result).toBe("settled");
	});
});
