import type { Metadata } from "next";

import { HandleDetail } from "@src/components/handles/HandleDetail";

type PageProperties = {
	params: Promise<{ handle: string }>;
};

export function generateMetadata({ params }: PageProperties): Promise<Metadata> {
	return params.then(({ handle }) => {
		const decoded = decodeURIComponent(handle).replace(/^@+/, "");
		return {
			title: `@${decoded}`,
			description: `Ownership, listing, offers, and trading history for @${decoded} on tiny.place.`,
		};
	});
}

export default async function HandlePage({
	params,
}: PageProperties): Promise<React.ReactElement> {
	const { handle } = await params;
	return <HandleDetail handle={decodeURIComponent(handle)} />;
}
