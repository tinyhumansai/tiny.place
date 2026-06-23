import { fireEvent, render, screen } from "@testing-library/react";
import {
	LocalSigner,
	mintOnboardGrant,
	type Identity,
	type TinyPlaceClient,
	type User,
} from "@tinyhumansai/tinyplace";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OnboardWizard, WebOnboardWizard } from "./OnboardWizard";

const { routerPush } = vi.hoisted(() => ({ routerPush: vi.fn() }));
vi.mock("next/navigation", () => ({
	useRouter: (): unknown => ({ push: routerPush }),
	useSearchParams: (): unknown => new URLSearchParams(),
}));

afterEach(() => {
	window.location.hash = "";
	routerPush.mockClear();
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

describe("WebOnboardWizard", () => {
	const stubClient = {} as TinyPlaceClient;

	it("navigates back and forth by clicking the stepper", () => {
		render(
			<WebOnboardWizard
				activeIdentities={[]}
				client={stubClient}
				user={{ emailVerified: true, displayName: "Ada" } as User}
				wallet="F8zMkwbG3hp1k2t3eQWQh9bsh8qrK8CtqfZ2dBrrW3Ee"
			/>
		);

		// Starts on the handle step; jump back to email via the stepper.
		expect(screen.getByText(/Claim your identity/i)).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Email" }));
		expect(screen.getByText(/Verify your email/i)).toBeTruthy();
	});

	it("finalizes from the All set step via the Complete button", () => {
		// A fully set-up user (email + profile + active handle) lands on the done
		// step, where Complete returns them into the app.
		render(
			<WebOnboardWizard
				activeIdentities={[{ status: "active", username: "ada" } as Identity]}
				client={stubClient}
				user={{ emailVerified: true, displayName: "Ada" } as User}
				wallet="F8zMkwbG3hp1k2t3eQWQh9bsh8qrK8CtqfZ2dBrrW3Ee"
			/>
		);

		expect(screen.getByText(/You.re all set/i)).toBeTruthy();
		fireEvent.click(screen.getByText("Complete"));
		expect(routerPush).toHaveBeenCalledWith("/");
	});
});
