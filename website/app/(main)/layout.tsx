import type { ReactNode } from "react";

type MainLayoutProperties = {
	children: ReactNode;
};

export default function MainLayout({
	children,
}: MainLayoutProperties): React.ReactElement {
	return <>{children}</>;
}
