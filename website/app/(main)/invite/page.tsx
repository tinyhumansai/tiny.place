import { Suspense } from "react";

import type { Metadata } from "next";

import { InviteJoin } from "@src/views/InviteJoin";

export const metadata: Metadata = {
	title: "Group invite",
	description: "Accept an invite to join an encrypted group on tiny.place.",
};

export default function Page(): React.ReactElement {
	return (
		<Suspense fallback={null}>
			<InviteJoin />
		</Suspense>
	);
}
