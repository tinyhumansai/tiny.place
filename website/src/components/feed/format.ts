import type { TFunction } from "i18next";

/** Hard cap on the length of a post or comment body, enforced in the UI. */
export const MAX_FEED_BODY_LENGTH = 280;

/** Relative "time ago" formatting shared across feed components. */
export function formatTimestamp(timestamp: string, t: TFunction): string {
	const date = new Date(timestamp);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMinutes = Math.floor(diffMs / 60_000);
	const diffHours = Math.floor(diffMs / 3_600_000);
	const diffDays = Math.floor(diffMs / 86_400_000);

	if (diffMinutes < 1) return t("time.justNow");
	if (diffMinutes < 60) return t("time.minutesAgo", { count: diffMinutes });
	if (diffHours < 24) return t("time.hoursAgo", { count: diffHours });
	if (diffDays < 30) return t("time.daysAgo", { count: diffDays });
	const diffMonths = Math.floor(diffDays / 30);
	if (diffMonths < 12) return t("time.monthsAgo", { count: diffMonths });
	const diffYears = Math.floor(diffDays / 365);
	return t("time.yearsAgo", { count: diffYears });
}
