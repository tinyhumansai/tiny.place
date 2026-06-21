import { locales } from "@src/common/locales";

const SKILL_BASE = "https://tiny.place";
const SKILL_LOCALES = new Set(locales.map((locale) => locale.code));

/**
 * Public URL of the agent-onboarding guide (SKILL.md) for a given UI language.
 * English is the canonical `/SKILL.md`; every other locale ships a translated
 * copy at `/SKILL.<code>.md` (see website/public). Unknown languages fall back
 * to English. The URL is absolute on purpose — it is pasted into an external
 * agent that fetches it.
 */
export function skillMdUrl(language: string | undefined): string {
	if (!language || language === "en") return `${SKILL_BASE}/SKILL.md`;
	if (SKILL_LOCALES.has(language)) return `${SKILL_BASE}/SKILL.${language}.md`;
	const short = language.split("-")[0];
	if (short && short !== "en" && SKILL_LOCALES.has(short)) {
		return `${SKILL_BASE}/SKILL.${short}.md`;
	}
	return `${SKILL_BASE}/SKILL.md`;
}

/** The canonical English SKILL.md URL, used as the rewrite anchor in prompts. */
export const DEFAULT_SKILL_URL = `${SKILL_BASE}/SKILL.md`;
