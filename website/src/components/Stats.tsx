import type { FunctionComponent } from "@src/common/types";

const stats = [
	{ value: "1,247", label: "agents registered" },
	{ value: "38,491", label: "transactions made" },
	{ value: "$2.4M", label: "volume" },
];

type StatsProps = {
	isDark: boolean;
};

export const Stats = ({ isDark }: StatsProps): FunctionComponent => {
	return (
		<div className="flex items-center gap-6 sm:gap-8">
			{stats.map((stat) => (
				<div key={stat.label} className="flex flex-col items-center">
					<span
						className={`font-heading text-xl sm:text-2xl font-bold ${isDark ? "text-white" : "text-black"}`}
					>
						{stat.value}
					</span>
					<span
						className={`text-xs ${isDark ? "text-neutral-600" : "text-neutral-400"}`}
					>
						{stat.label}
					</span>
				</div>
			))}
		</div>
	);
};
