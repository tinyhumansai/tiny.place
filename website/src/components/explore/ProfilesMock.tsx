import type { AgentCard } from "@tinyhumansai/tinyplace";

import type { FunctionComponent } from "@src/common/types";
import { useAgents } from "@src/hooks/use-directory";

function truncateCryptoId(cryptoId: string): string {
	if (cryptoId.length <= 12) {
		return cryptoId;
	}
	return `${cryptoId.slice(0, 6)}…${cryptoId.slice(-4)}`;
}

function formatHandle(agent: AgentCard): string {
	return `@${agent.username ?? agent.name}`;
}

function formatDate(iso: string): string {
	return new Date(iso).toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

type ProfilesMockProperties = {
	isDark: boolean;
};

export const ProfilesMock = ({
	isDark,
}: ProfilesMockProperties): FunctionComponent => {
	const { data, isLoading, isError, error } = useAgents();

	const cardClass = isDark
		? "border-neutral-800 bg-neutral-950"
		: "border-neutral-200 bg-neutral-50";
	const headingClass = isDark ? "text-white" : "text-black";
	const secondaryClass = isDark ? "text-neutral-500" : "text-neutral-400";
	const tagClass = isDark
		? "bg-neutral-800 text-neutral-400"
		: "bg-neutral-200 text-neutral-500";

	if (isLoading) {
		return (
			<div className={`rounded-lg border p-4 ${cardClass}`}>
				<div className="flex items-center justify-center py-8">
					<span className={`text-sm ${secondaryClass}`}>
						Loading profile...
					</span>
				</div>
			</div>
		);
	}

	if (isError) {
		return (
			<div className={`rounded-lg border p-4 ${cardClass}`}>
				<div className="flex items-center justify-center py-8">
					<span className="text-sm text-red-500">
						Failed to load profile: {error?.message ?? "Unknown error"}
					</span>
				</div>
			</div>
		);
	}

	const agents = data?.agents ?? [];

	if (agents.length === 0) {
		return (
			<div className={`rounded-lg border p-4 ${cardClass}`}>
				<div className="flex items-center justify-center py-8">
					<span className={`text-sm ${secondaryClass}`}>
						No agents found.
					</span>
				</div>
			</div>
		);
	}

	const agent = agents[0] as AgentCard;
	const handle = formatHandle(agent);
	const initials = agent.name.slice(0, 2).toUpperCase();
	const bio = agent.description ?? "";
	const skills: Array<string> = agent.skills ?? agent.tags ?? [];

	return (
		<div className={`rounded-lg border p-4 ${cardClass}`}>
			<div className="flex items-start gap-4">
				<div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-lg font-semibold text-white">
					{initials}
				</div>
				<div>
					<h3 className={`text-sm font-semibold ${headingClass}`}>
						{handle}
					</h3>
					<p className={`mt-0.5 font-mono text-xs ${secondaryClass}`}>
						{truncateCryptoId(agent.cryptoId)}
					</p>
					{bio && (
						<p
							className={`mt-1.5 text-xs leading-relaxed ${secondaryClass}`}
						>
							{bio}
						</p>
					)}
				</div>
			</div>

			{skills.length > 0 && (
				<div
					className={`mt-4 border-t pt-4 ${isDark ? "border-neutral-800" : "border-neutral-200"}`}
				>
					<h4 className={`mb-2 text-xs font-medium ${headingClass}`}>
						Skills
					</h4>
					<div className="flex flex-wrap gap-1.5">
						{skills.map((skill) => (
							<span
								key={skill}
								className={`rounded-full px-2 py-0.5 text-xs ${tagClass}`}
							>
								{skill}
							</span>
						))}
					</div>
				</div>
			)}

			<div
				className={`mt-4 border-t pt-4 ${isDark ? "border-neutral-800" : "border-neutral-200"}`}
			>
				<span className={`text-xs ${secondaryClass}`}>
					Joined {formatDate(agent.createdAt)}
				</span>
			</div>
		</div>
	);
};
