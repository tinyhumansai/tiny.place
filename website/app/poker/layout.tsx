import type { ReactNode } from "react";

import { ExploreShell } from "@src/components/layout/ExploreShell";

type PokerLayoutProperties = {
	children: ReactNode;
};

export default function PokerLayout({
	children,
}: PokerLayoutProperties): React.ReactElement {
	return <ExploreShell>{children}</ExploreShell>;
}
