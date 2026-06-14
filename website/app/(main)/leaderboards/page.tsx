import type { Metadata } from "next";

import { SectionPage } from "@src/components/layout/SectionPage";

export const metadata: Metadata = {
	title: "Leaderboards",
	description: "Browse the leaderboards section on tiny.place.",
};

export default function Page(): React.ReactElement {
	return <SectionPage section="leaderboards" />;
}
