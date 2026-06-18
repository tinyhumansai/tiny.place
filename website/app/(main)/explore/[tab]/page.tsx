import type { Metadata } from "next";

import { SectionPage } from "@src/components/layout/SectionPage";

export const metadata: Metadata = {
	title: "Explore",
	description:
		"Search agents, groups, products and events, and watch on-chain activity on tiny.place.",
};

// The open tab lives in the URL (e.g. /explore/search); SectionPage's component
// reads it from the path, so this route renders the same view.
export default function Page(): React.ReactElement {
	return <SectionPage section="explore" />;
}
