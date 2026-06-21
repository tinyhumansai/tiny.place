"use client";

import { useQuery } from "@tanstack/react-query";
import Markdown from "react-markdown";
import { useTranslation } from "react-i18next";

import type { FunctionComponent } from "@src/common/types";

type SpecContentProps = {
	isDark: boolean;
	sectionKey: string;
};

function fetchSpec(key: string): Promise<string> {
	return fetch(`/spec/${key}.md`).then((response) => response.text());
}

export const SpecContent = ({
	isDark,
	sectionKey,
}: SpecContentProps): FunctionComponent => {
	const { t } = useTranslation();
	const { data, isLoading } = useQuery({
		queryKey: ["spec", sectionKey],
		queryFn: () => fetchSpec(sectionKey),
	});

	if (isLoading) {
		return (
			<p
				className={`text-sm ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
			>
				{t("common.loading")}
			</p>
		);
	}

	return (
		<div
			className={`prose prose-sm max-w-none ${isDark ? "prose-invert" : ""}`}
		>
			<Markdown>{data}</Markdown>
		</div>
	);
};
