import type { ReactNode } from "react";

type HandleLayoutProperties = {
	children: ReactNode;
};

export default function HandleLayout({
	children,
}: HandleLayoutProperties): React.ReactElement {
	return <>{children}</>;
}
