import Link from "next/link";
import type { ReactElement, ReactNode } from "react";

function stripHandle(value: string): string {
	return value.trim().replace(/^@/, "");
}

function profileHrefForEntity(value: string | undefined): string | null {
	const trimmed = value?.trim();
	if (!trimmed) {
		return null;
	}
	if (trimmed.startsWith("@")) {
		return `/handles/${encodeURIComponent(stripHandle(trimmed))}`;
	}
	return `/u/${encodeURIComponent(trimmed)}`;
}

export function ProfileEntityLink({
	children,
	className,
	value,
}: {
	children?: ReactNode;
	className?: string;
	value: string | undefined;
}): ReactElement {
	const href = profileHrefForEntity(value);
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
