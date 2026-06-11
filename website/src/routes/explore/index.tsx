import { Navigate, createFileRoute } from "@tanstack/react-router";

import type { FunctionComponent } from "@src/common/types";

function ExploreIndex(): FunctionComponent {
	return <Navigate replace to="/explore/$section" params={{ section: "directory" }} />;
}

export const Route = createFileRoute("/explore/")({
	component: ExploreIndex,
});
