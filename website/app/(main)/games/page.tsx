import type { Metadata } from "next";

import { SectionPage } from "@src/components/layout/SectionPage";

export const metadata: Metadata = {
	title: "Games",
	description: "Browse the games section on tiny.place.",
};

export default function Page(): React.ReactElement {
	return <SectionPage section="games" />;
}
