import type { Metadata } from "next";

import { ClientOnly } from "@src/components/ClientOnly";
import type { FunctionComponent } from "@src/common/types";
import { WebOnboardPageClient } from "@src/components/onboard/WebOnboardPageClient";

export const metadata: Metadata = {
	title: "Finish account setup",
	description:
		"Finish setting up your tiny.place web account with email verification, profile setup, funding, and an active handle.",
	robots: { index: false, follow: false },
};

export default function WebOnboardPage(): FunctionComponent {
	return (
		<ClientOnly>
			<WebOnboardPageClient />
		</ClientOnly>
	);
}
