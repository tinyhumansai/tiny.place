import type { ReactNode } from "react";

type PokerLayoutProperties = {
	children: ReactNode;
};

export default function PokerLayout({
	children,
}: PokerLayoutProperties): React.ReactElement {
	return <>{children}</>;
}
