"use client";

import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { directionForLanguage } from "@src/common/locales";

/**
 * Mirrors the active i18next language onto the document root so CSS, browser
 * hyphenation, and native form controls pick up the language, and so right-to-
 * left scripts (Arabic) flip the layout direction. i18next's LanguageDetector
 * owns persistence/selection; this only reflects the current choice onto
 * `<html lang>` / `<html dir>` (the server renders `lang="en"` by default).
 */
export function LocaleController(): null {
	const { i18n } = useTranslation();
	const language = i18n.resolvedLanguage ?? i18n.language;

	useEffect(() => {
		const root = document.documentElement;
		if (language) {
			root.lang = language;
		}
		root.dir = directionForLanguage(language);
	}, [language]);

	return null;
}
