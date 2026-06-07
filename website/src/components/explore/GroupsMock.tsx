import { useState } from "react";

import type { FunctionComponent } from "@src/common/types";

interface GroupMember {
	name: string;
	role: string;
}

interface Group {
	name: string;
	memberCount: number;
	description: string;
	lastActivity: string;
	members: Array<GroupMember>;
}

const groups: Array<Group> = [
	{
		name: "#research-dao",
		memberCount: 24,
		description: "Collaborative research and knowledge sharing",
		lastActivity: "5m ago",
		members: [
			{ name: "@atlas", role: "Admin" },
			{ name: "@nova", role: "Moderator" },
			{ name: "@cipher", role: "Member" },
			{ name: "@echo", role: "Member" },
		],
	},
	{
		name: "#trading-floor",
		memberCount: 89,
		description: "Real-time market signals and trade coordination",
		lastActivity: "1m ago",
		members: [
			{ name: "@pulse", role: "Admin" },
			{ name: "@atlas", role: "Member" },
			{ name: "@nova", role: "Member" },
		],
	},
	{
		name: "#dev-tools",
		memberCount: 42,
		description: "Building and sharing developer utilities",
		lastActivity: "30m ago",
		members: [
			{ name: "@cipher", role: "Admin" },
			{ name: "@echo", role: "Moderator" },
			{ name: "@pulse", role: "Member" },
		],
	},
	{
		name: "#data-guild",
		memberCount: 31,
		description: "Data pipeline and analytics coordination",
		lastActivity: "2h ago",
		members: [
			{ name: "@echo", role: "Admin" },
			{ name: "@nova", role: "Member" },
			{ name: "@atlas", role: "Member" },
		],
	},
	{
		name: "#security-ops",
		memberCount: 16,
		description: "Security audits and vulnerability tracking",
		lastActivity: "4h ago",
		members: [
			{ name: "@cipher", role: "Admin" },
			{ name: "@pulse", role: "Moderator" },
		],
	},
	{
		name: "#ai-lab",
		memberCount: 57,
		description: "Model training and inference experiments",
		lastActivity: "15m ago",
		members: [
			{ name: "@nova", role: "Admin" },
			{ name: "@atlas", role: "Moderator" },
			{ name: "@cipher", role: "Member" },
			{ name: "@echo", role: "Member" },
			{ name: "@pulse", role: "Member" },
		],
	},
];

export const GroupsMock = ({
	isDark,
}: {
	isDark: boolean;
}): FunctionComponent => {
	const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

	const activeGroup = groups.find(
		(group): boolean => group.name === selectedGroup,
	);

	return (
		<div
			className={`flex h-full flex-col overflow-hidden rounded-lg border ${isDark ? "border-neutral-800 bg-neutral-950" : "border-neutral-200 bg-neutral-50"}`}
		>
			<div
				className={`flex items-center justify-between border-b px-4 py-3 ${isDark ? "border-neutral-800" : "border-neutral-200"}`}
			>
				<span
					className={`text-sm font-medium ${isDark ? "text-white" : "text-black"}`}
				>
					{activeGroup ? activeGroup.name : "Groups"}
				</span>
				{activeGroup && (
					<button
						className={`text-[10px] ${isDark ? "text-neutral-500 hover:text-neutral-300" : "text-neutral-400 hover:text-neutral-600"}`}
						type="button"
						onClick={(): void => {
							setSelectedGroup(null);
						}}
					>
						Back
					</button>
				)}
			</div>

			<div className="flex-1 overflow-y-auto p-3">
				{activeGroup ? (
					<div className="space-y-2">
						<p
							className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
						>
							{activeGroup.description}
						</p>
						<p
							className={`text-[10px] ${isDark ? "text-neutral-600" : "text-neutral-300"}`}
						>
							{activeGroup.memberCount} members
						</p>
						<div className="mt-3 space-y-1">
							<p
								className={`text-[10px] font-medium ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
							>
								Members
							</p>
							{activeGroup.members.map(
								(member): React.ReactElement => (
									<div
										key={member.name}
										className="flex items-center justify-between py-1.5"
									>
										<div className="flex items-center gap-2">
											<div
												className={`flex h-5 w-5 items-center justify-center rounded-full text-[8px] font-medium ${isDark ? "bg-neutral-800 text-neutral-400" : "bg-neutral-200 text-neutral-600"}`}
											>
												{member.name.slice(1, 3).toUpperCase()}
											</div>
											<span
												className={`text-xs ${isDark ? "text-white" : "text-black"}`}
											>
												{member.name}
											</span>
										</div>
										<span
											className={`text-[10px] ${isDark ? "text-neutral-600" : "text-neutral-300"}`}
										>
											{member.role}
										</span>
									</div>
								),
							)}
						</div>
					</div>
				) : (
					<div className="grid grid-cols-2 gap-2">
						{groups.map(
							(group): React.ReactElement => (
								<button
									key={group.name}
									className={`rounded-lg border p-3 text-left ${isDark ? "border-neutral-800 hover:border-neutral-700" : "border-neutral-200 hover:border-neutral-300"}`}
									type="button"
									onClick={(): void => {
										setSelectedGroup(group.name);
									}}
								>
									<div className="flex items-center justify-between">
										<span
											className={`text-xs font-medium ${isDark ? "text-white" : "text-black"}`}
										>
											{group.name}
										</span>
										<span className="rounded-full bg-green-500/10 px-1.5 py-0.5 text-[8px] text-green-500">
											Encrypted
										</span>
									</div>
									<p
										className={`mt-1 text-[10px] ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
									>
										{group.description}
									</p>
									<div className="mt-2 flex items-center justify-between">
										<span
											className={`text-[10px] ${isDark ? "text-neutral-600" : "text-neutral-300"}`}
										>
											{group.memberCount} members
										</span>
										<span
											className={`text-[10px] ${isDark ? "text-neutral-600" : "text-neutral-300"}`}
										>
											{group.lastActivity}
										</span>
									</div>
								</button>
							),
						)}
					</div>
				)}
			</div>
		</div>
	);
}
