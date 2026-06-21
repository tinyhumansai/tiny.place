/**
 * Supported UI locales for tiny.place.
 *
 * `code` is the i18next/BCP-47 language tag (matches the directory under
 * `src/assets/locales/<code>/translations.json` and the key in
 * `resources` in `common/i18n.ts`). `nativeName` is the language's own name,
 * shown in the language picker. `dir` drives `<html dir>` for right-to-left
 * scripts (Arabic).
 */
export type LocaleDirection = "ltr" | "rtl";

export type LocaleMeta = {
	code: string;
	dir: LocaleDirection;
	/** Representative flag emoji, shown in the header language picker. */
	flag: string;
	nativeName: string;
};

export const locales: Array<LocaleMeta> = [
	{ code: "en", dir: "ltr", flag: "🇬🇧", nativeName: "English" },
	{ code: "es", dir: "ltr", flag: "🇪🇸", nativeName: "Español" },
	{ code: "fr", dir: "ltr", flag: "🇫🇷", nativeName: "Français" },
	{ code: "de", dir: "ltr", flag: "🇩🇪", nativeName: "Deutsch" },
	{ code: "pt", dir: "ltr", flag: "🇧🇷", nativeName: "Português" },
	{ code: "it", dir: "ltr", flag: "🇮🇹", nativeName: "Italiano" },
	{ code: "pl", dir: "ltr", flag: "🇵🇱", nativeName: "Polski" },
	{ code: "ru", dir: "ltr", flag: "🇷🇺", nativeName: "Русский" },
	{ code: "id", dir: "ltr", flag: "🇮🇩", nativeName: "Bahasa Indonesia" },
	{ code: "hi", dir: "ltr", flag: "🇮🇳", nativeName: "हिन्दी" },
	{ code: "bn", dir: "ltr", flag: "🇧🇩", nativeName: "বাংলা" },
	{ code: "zh-CN", dir: "ltr", flag: "🇨🇳", nativeName: "简体中文" },
	{ code: "ko", dir: "ltr", flag: "🇰🇷", nativeName: "한국어" },
	{ code: "ar", dir: "rtl", flag: "🇸🇦", nativeName: "العربية" },
];

const directionByCode = new Map<string, LocaleDirection>(
	locales.map((locale) => [locale.code, locale.dir])
);

/**
 * Direction for a resolved i18next language. Falls back to a language-only
 * lookup (e.g. "ar-EG" -> "ar") and finally to left-to-right.
 */
export function directionForLanguage(
	language: string | undefined
): LocaleDirection {
	if (!language) return "ltr";
	const base = language.split("-")[0] ?? language;
	return directionByCode.get(language) ?? directionByCode.get(base) ?? "ltr";
}
