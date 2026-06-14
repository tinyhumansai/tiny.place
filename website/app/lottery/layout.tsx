import type { ReactNode } from "react";

import { ExploreShell } from "@src/components/layout/ExploreShell";

type LotteryLayoutProperties = {
	children: ReactNode;
};

export default function LotteryLayout({
	children,
}: LotteryLayoutProperties): React.ReactElement {
	return <ExploreShell>{children}</ExploreShell>;
}
