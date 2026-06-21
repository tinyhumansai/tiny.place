import { useTranslation } from "react-i18next";

export function StatusBadge({
	isDark,
	status,
}: {
	isDark: boolean;
	status: string;
}): React.ReactElement {
	const { t } = useTranslation();
	const positive = status === "settled" || status === "resolved";
	const warning =
		status === "delivered" ||
		status === "revision_requested" ||
		status === "accepted";
	const danger =
		status === "disputed" || status === "cancelled" || status === "expired";
	const tone = positive
		? "bg-emerald-500/10 text-emerald-500"
		: danger
			? "bg-red-500/10 text-red-500"
			: warning
				? "bg-amber-500/10 text-amber-500"
				: isDark
					? "bg-neutral-800 text-neutral-400"
					: "bg-neutral-200 text-neutral-600";
	return (
		<span
			className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${tone}`}
		>
			{t(`marketplace.status.${status}`, {
				defaultValue: status.replace(/_/g, " "),
			})}
		</span>
	);
}
