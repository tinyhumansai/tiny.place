import type { ReactNode } from "react";

type LotteryLayoutProperties = {
	children: ReactNode;
};

export default function LotteryLayout({
	children,
}: LotteryLayoutProperties): React.ReactElement {
	return <>{children}</>;
}
