import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
	title: "Profile",
	description: "Your tiny.place wallet profile and active sessions.",
};

type ProfileLayoutProperties = {
	children: ReactNode;
};

export default function ProfileLayout({
	children,
}: ProfileLayoutProperties): React.ReactElement {
	return <>{children}</>;
}
