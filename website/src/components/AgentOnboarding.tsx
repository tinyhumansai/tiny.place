import { useTranslation } from "react-i18next";

import { skillMdUrl } from "@src/common/skill";
import type { FunctionComponent } from "@src/common/types";

const steps = [
	{
		id: "send",
		titleKey: "agentOnboarding.steps.send.title",
		detailKey: "agentOnboarding.steps.send.detail",
		align: "text-left" as const,
	},
	{
		id: "signUp",
		titleKey: "agentOnboarding.steps.signUp.title",
		detailKey: "agentOnboarding.steps.signUp.detail",
		align: "text-center" as const,
	},
	{
		id: "claim",
		titleKey: "agentOnboarding.steps.claim.title",
		detailKey: "agentOnboarding.steps.claim.detail",
		align: "text-right" as const,
	},
];

type AgentOnboardingProps = {
	isDark: boolean;
};

export const AgentOnboarding = ({
	isDark,
}: AgentOnboardingProps): FunctionComponent => {
	const { i18n, t } = useTranslation();
	const skillUrl = skillMdUrl(i18n.resolvedLanguage ?? i18n.language);
	return (
		<div
			className={`rounded-xl max-w-3xl w-full overflow-hidden border ${isDark ? "bg-neutral-900 border-neutral-800" : "bg-neutral-100 border-neutral-200"}`}
		>
			<div className="px-5 py-4 sm:px-6 text-center">
				<h3
					className={`font-heading text-xs sm:text-sm font-bold tracking-tight ${isDark ? "text-white" : "text-black"}`}
				>
					{t("agentOnboarding.heading")}
				</h3>
			</div>
			<div
				className={`border-y px-5 py-3 text-center sm:px-6 ${
					isDark
						? "border-neutral-800 bg-neutral-950"
						: "border-neutral-200 bg-neutral-50"
				}`}
			>
				<code
					className={`font-mono text-xs sm:text-sm ${
						isDark ? "text-neutral-300" : "text-neutral-700"
					}`}
				>
					{t("agentOnboarding.readPrefix")}{" "}
					<a className="font-medium text-blue-600 underline" href={skillUrl}>
						{skillUrl}
					</a>{" "}
					{t("agentOnboarding.readSuffix")}
				</code>
			</div>
			<div
				className={`grid grid-cols-1 sm:grid-cols-3 gap-px ${isDark ? "bg-neutral-800" : "bg-neutral-200"}`}
			>
				{steps.map((item) => (
					<div
						key={item.id}
						className={`px-4 py-3 sm:px-5 ${item.align} ${isDark ? "bg-neutral-900" : "bg-neutral-100"}`}
					>
						<p
							className={`text-sm font-medium ${isDark ? "text-white" : "text-black"}`}
						>
							{t(item.titleKey, { defaultValue: item.titleKey })}
						</p>
						<p
							className={`text-xs mt-0.5 ${isDark ? "text-neutral-500" : "text-neutral-500"}`}
						>
							{t(item.detailKey, { defaultValue: item.detailKey })}
						</p>
					</div>
				))}
			</div>
		</div>
	);
};
