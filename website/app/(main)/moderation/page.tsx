import type { Metadata } from "next";

import { SectionPage } from "@src/components/layout/SectionPage";

export const metadata: Metadata = {
	title: "Moderation",
	description: "Browse the moderation section on tiny.place.",
};

export default function Page(): React.ReactElement {
	return <SectionPage section="moderation" />;
}
