"use client";

import { useQuery } from "@tanstack/react-query";
import type { TermsDocument } from "@tinyhumansai/tinyplace";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import { useApiClient } from "@src/common/api-context";
import { queryKeys } from "@src/common/query-keys";
import type { FunctionComponent } from "@src/common/types";

type Section = {
	number?: number;
	title: string;
	body: string;
};

const buildFallbackSections = (t: TFunction): Array<Section> => [
	{
		number: 1,
		title: t("terms.fallback.section1.title"),
		body: t("terms.fallback.section1.body"),
	},
	{
		number: 2,
		title: t("terms.fallback.section2.title"),
		body: t("terms.fallback.section2.body"),
	},
	{
		number: 3,
		title: t("terms.fallback.section3.title"),
		body: t("terms.fallback.section3.body"),
	},
	{
		number: 4,
		title: t("terms.fallback.section4.title"),
		body: t("terms.fallback.section4.body"),
	},
	{
		number: 5,
		title: t("terms.fallback.section5.title"),
		body: t("terms.fallback.section5.body"),
	},
	{
		number: 6,
		title: t("terms.fallback.section6.title"),
		body: t("terms.fallback.section6.body"),
	},
];

const parseTermsSections = (text: string, t: TFunction): Array<Section> => {
	const sectionMatches = [...text.matchAll(/^(\d+)\.\s+(.+)$/gm)];
	if (sectionMatches.length === 0) {
		return [{ title: t("terms.sectionFallbackTitle"), body: text.trim() }];
	}

	const parsed: Array<Section> = [];
	const intro = text.slice(0, sectionMatches[0]?.index ?? 0).trim();
	if (intro) {
		parsed.push({ title: t("terms.overviewTitle"), body: intro });
	}

	for (const [index, match] of sectionMatches.entries()) {
		const start = (match.index ?? 0) + match[0].length;
		const end = sectionMatches[index + 1]?.index ?? text.length;
		parsed.push({
			number: Number(match[1]),
			title: match[2]?.trim() ?? t("terms.sectionFallbackTitle"),
			body: text.slice(start, end).trim(),
		});
	}

	return parsed.filter((section) => section.body.length > 0);
};

const formatEffectiveDate = (iso: string): string =>
	new Intl.DateTimeFormat(undefined, {
		month: "long",
		day: "numeric",
		year: "numeric",
	}).format(new Date(iso));

type TermsProperties = {
	isDark: boolean;
};

export const Terms = ({ isDark }: TermsProperties): FunctionComponent => {
	const { t } = useTranslation();
	const client = useApiClient();
	const { data, isError, isLoading } = useQuery({
		queryKey: queryKeys.docs.terms(),
		queryFn: (): Promise<TermsDocument> => client.docs.terms(),
	});
	const termsSections = data
		? parseTermsSections(data.text, t)
		: buildFallbackSections(t);

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<span
					className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
				>
					{t("terms.effectiveDate", {
						date: data ? formatEffectiveDate(data.effectiveDate) : "2026-01-01",
					})}
				</span>
				<span
					className={`rounded-full px-2 py-0.5 text-xs ${
						isDark
							? "bg-neutral-800 text-neutral-400"
							: "bg-neutral-200 text-neutral-500"
					}`}
				>
					{t("terms.version", { version: data?.version ?? "1.2" })}
				</span>
			</div>
			{data?.title && (
				<h3
					className={`text-sm font-medium ${isDark ? "text-white" : "text-black"}`}
				>
					{data.title}
				</h3>
			)}
			{isLoading && (
				<p
					className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
				>
					{t("terms.loading")}
				</p>
			)}
			{isError && (
				<p className="text-xs text-red-500">{t("terms.loadError")}</p>
			)}
			<div className="space-y-3">
				{termsSections.map((section) => (
					<div
						key={`${String(section.number ?? 0)}-${section.title}`}
						className={`rounded-lg border p-3 ${
							isDark
								? "border-neutral-800 bg-neutral-950"
								: "border-neutral-200 bg-neutral-50"
						}`}
					>
						<span
							className={`text-sm font-medium ${isDark ? "text-white" : "text-black"}`}
						>
							{section.number ? `${String(section.number)}. ` : ""}
							{section.title}
						</span>
						<p
							className={`mt-1 whitespace-pre-line text-xs leading-relaxed ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
						>
							{section.body}
						</p>
					</div>
				))}
			</div>
		</div>
	);
};
