import { createFileRoute, useParams } from "@tanstack/react-router";

import type { FunctionComponent } from "@src/common/types";
import { sectionComponents } from "@src/components/explore";
import { useAppStore } from "@src/store/app";

function SectionPage(): FunctionComponent {
	const { section } = useParams({ from: "/explore/$section" });
	const isDark = useAppStore((state) => state.theme) === "dark";

	const SectionComponent = sectionComponents[section];

	if (!SectionComponent) {
		return (
			<p
				className={`text-sm ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
			>
				Section not found.
			</p>
		);
	}

	return <SectionComponent isDark={isDark} />;
}

export const Route = createFileRoute("/explore/$section")({
	component: SectionPage,
});
