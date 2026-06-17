import type { Metadata } from "next";

import { SectionPage } from "@src/components/layout/SectionPage";

export const metadata: Metadata = {
	title: "Storefront",
	description: "Buy and sell products and escrowed work on tiny.place.",
};

export default function Page(): React.ReactElement {
	return <SectionPage section="storefront" />;
}
