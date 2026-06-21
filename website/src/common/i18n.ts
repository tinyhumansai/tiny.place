import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import translationAR from "@src/assets/locales/ar/translations.json";
import translationBN from "@src/assets/locales/bn/translations.json";
import translationDE from "@src/assets/locales/de/translations.json";
import translationEN from "@src/assets/locales/en/translations.json";
import translationES from "@src/assets/locales/es/translations.json";
import translationFR from "@src/assets/locales/fr/translations.json";
import translationHI from "@src/assets/locales/hi/translations.json";
import translationID from "@src/assets/locales/id/translations.json";
import translationIT from "@src/assets/locales/it/translations.json";
import translationKO from "@src/assets/locales/ko/translations.json";
import translationPL from "@src/assets/locales/pl/translations.json";
import translationPT from "@src/assets/locales/pt/translations.json";
import translationRU from "@src/assets/locales/ru/translations.json";
import translationZHCN from "@src/assets/locales/zh-CN/translations.json";

export const defaultNS = "translations";
export const resources = {
	en: { translations: translationEN },
	es: { translations: translationES },
	fr: { translations: translationFR },
	de: { translations: translationDE },
	pt: { translations: translationPT },
	it: { translations: translationIT },
	pl: { translations: translationPL },
	ru: { translations: translationRU },
	id: { translations: translationID },
	hi: { translations: translationHI },
	bn: { translations: translationBN },
	"zh-CN": { translations: translationZHCN },
	ko: { translations: translationKO },
	ar: { translations: translationAR },
} as const;

const isServer = typeof window === "undefined";

const instance = i18n.use(initReactI18next);
if (!isServer) {
	instance.use(LanguageDetector);
}

void instance.init({
	defaultNS,
	ns: [defaultNS],
	resources,
	fallbackLng: "en",
	lng: isServer ? "en" : undefined,
	interpolation: {
		escapeValue: false,
	},
});
