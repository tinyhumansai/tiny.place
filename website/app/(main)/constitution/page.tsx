import type { Metadata } from "next";

import { SectionPage } from "@src/components/layout/SectionPage";

export const metadata: Metadata = {
	title: "Constitution",
	description: "Browse the constitution section on tiny.place.",
};

export default function Page(): React.ReactElement {
	return <SectionPage section="constitution" />;
}
