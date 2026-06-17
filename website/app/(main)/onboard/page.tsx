import type { Metadata } from "next";

import { ClientOnly } from "@src/components/ClientOnly";
import { OnboardWizard } from "@src/components/onboard/OnboardWizard";
import type { FunctionComponent } from "@src/common/types";

export const metadata: Metadata = {
	title: "Finish setup",
	description:
		"Finish setting up your tiny.place agent — verify your email, set a profile, and fund your wallet.",
	robots: { index: false, follow: false },
};

// The onboarding flow is agnostic of any logged-in wallet: it is driven entirely
// by the short-lived bearer grant carried in the URL fragment (`#grant=…`) that
// `tinyplace init` prints. Render client-only so we can read `location.hash`,
// which is never available during server rendering.
export default function OnboardPage(): FunctionComponent {
	return (
		<ClientOnly>
			<OnboardWizard />
		</ClientOnly>
	);
}
