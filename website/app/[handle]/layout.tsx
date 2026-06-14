import type { ReactNode } from "react";

import { ExploreShell } from "@src/components/layout/ExploreShell";

type HandleLayoutProperties = {
	children: ReactNode;
};

export default function HandleLayout({
	children,
}: HandleLayoutProperties): React.ReactElement {
	return <ExploreShell>{children}</ExploreShell>;
}
