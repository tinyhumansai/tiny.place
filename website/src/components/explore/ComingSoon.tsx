import type { FunctionComponent } from "@src/common/types";

type ComingSoonProperties = {
	description: string;
	title: string;
};

// Shared placeholder for sections/tabs that are on the roadmap but not yet
// shipped. Mirrors the inline "coming soon" tab style used inside Games.
export const ComingSoon = ({
	description,
	title,
}: ComingSoonProperties): FunctionComponent => (
	<div className="rounded-lg border border-border bg-surface p-10 text-center">
		<p className="text-front text-sm font-medium">{title}</p>
		<p className="text-muted mt-1 text-xs">{description}</p>
	</div>
);
