import Link from "next/link";
import type { ReactElement, ReactNode } from "react";

import { profileHref } from "@src/common/profile-link";

export function ProfileEntityLink({
	children,
	className,
	value,
}: {
	children?: ReactNode;
	className?: string;
	value: string | undefined;
}): ReactElement {
	const href = profileHref(value);
	const label = children ?? value ?? "";

	if (!href) {
		return <span className={className}>{label}</span>;
	}

	return (
		<Link className={className} href={href}>
			{label}
		</Link>
	);
}
