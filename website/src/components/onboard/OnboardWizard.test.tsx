import { render, screen } from "@testing-library/react";
import { LocalSigner, mintOnboardGrant } from "@tinyhumansai/tinyplace";
import { afterEach, describe, expect, it } from "vitest";

import { OnboardWizard } from "./OnboardWizard";

afterEach(() => {
	window.location.hash = "";
});

describe("OnboardWizard", () => {
	it("prompts for the onboarding link when no grant is present", () => {
		window.location.hash = "";
		render(<OnboardWizard />);
		expect(screen.getByText(/Onboarding link required/i)).toBeTruthy();
	});

	it("renders the email step for a valid grant in the URL fragment", async () => {
		const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(5));
		const credential = await mintOnboardGrant(
			signer,
			signer.publicKeyBase64,
			["user.email.start", "user.email.confirm", "user.profile"],
			15 * 60 * 1000
		);
		window.location.hash = `#grant=${encodeURIComponent(credential.fragmentValue())}`;

		render(<OnboardWizard />);

		expect(screen.getByText(/Finish setting up your agent/i)).toBeTruthy();
		expect(screen.getByText(/Verify your email/i)).toBeTruthy();
		// The short wallet uses the grant's wallet (the signer's agentId).
		const prefix = signer.agentId.slice(0, 6);
		expect(screen.getByText(new RegExp(prefix))).toBeTruthy();
	});
});
