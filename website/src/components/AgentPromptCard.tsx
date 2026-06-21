"use client";

import {
	ClipboardDocumentCheckIcon,
	ClipboardDocumentIcon,
	SparklesIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { FunctionComponent } from "@src/common/types";
import {
	DEFAULT_WORKS_WITH,
	type WorksWithAgent,
} from "@src/components/works-with";

type AgentPromptCardProps = {
	/** The prompt a human copy/pastes into their agent. Copied verbatim. */
	prompt: string;
	/** Instruction line shown above the prompt box. Defaults to a generic line. */
	instruction?: string;
	/** Label inside the folder tab at the top-left. */
	tabLabel?: string;
	/** Icon inside the folder tab. Defaults to a sparkle. */
	tabIcon?: ReactNode;
	/**
	 * Agents shown in the "Works with" row. Defaults to a curated set; pass an
	 * empty array or null to hide the row entirely.
	 */
	worksWith?: Array<WorksWithAgent> | null;
	className?: string;
};

const COPIED_RESET_MS = 1500;
// Matches the first http(s) URL in the prompt so it can be visually accented
// (the full prompt string is still what gets copied). The URL must end in an
// alphanumeric or "/" so trailing punctuation (e.g. "SKILL.md,") isn't swallowed
// into the link.
const URL_PATTERN = /(https?:\/\/[^\s]*[A-Za-z0-9/])/;

// The "Works with" logos ship a dark- and a light-surface variant per brand.
// Show the dark variant by default and swap to the light one when the document
// is in the light theme (data-theme="light"), driven by CSS so there's no JS
// theme read / hydration mismatch.
const AGENT_LOGO_CSS = `
.tp-agent-logo { display: inline-block; }
.tp-agent-logo.tp-agent-light { display: none; }
:root[data-theme="light"] .tp-agent-logo.tp-agent-dark { display: none; }
:root[data-theme="light"] .tp-agent-logo.tp-agent-light { display: inline-block; }
`;

/** Renders the prompt, accenting the first URL without altering the copy text. */
function renderPrompt(prompt: string): ReactNode {
	const parts = prompt.split(URL_PATTERN);
	if (parts.length === 1) {
		return prompt;
	}
	return parts.map((part, index) =>
		URL_PATTERN.test(part) ? (
			<span key={`url-${index}`} className="text-primary">
				{part}
			</span>
		) : (
			part
		)
	);
}

/**
 * A reusable "paste this prompt into your AI agent" card: a folder tab at the
 * top-left, an instruction line, the prompt in a monospace box with a one-click
 * copy button, and an optional "Works with" agent row. Fully theme-driven via
 * semantic tokens (no light/dark branching needed).
 */
export const AgentPromptCard = ({
	prompt,
	instruction,
	tabLabel,
	tabIcon,
	worksWith = DEFAULT_WORKS_WITH,
	className,
}: AgentPromptCardProps): FunctionComponent => {
	const { t } = useTranslation();
	const [copied, setCopied] = useState(false);

	const handleCopy = useCallback((): void => {
		if (typeof navigator === "undefined" || !navigator.clipboard) {
			return;
		}
		void navigator.clipboard.writeText(prompt).then((): void => {
			setCopied(true);
			setTimeout((): void => {
				setCopied(false);
			}, COPIED_RESET_MS);
		});
	}, [prompt]);

	const agents = worksWith ?? [];

	return (
		// max-w-4xl matches the explore section column (Messaging, Bounties, …),
		// so the card lines up with the rest of the app; override via `className`.
		<div className={`w-full max-w-4xl ${className ?? ""}`}>
			<style>{AGENT_LOGO_CSS}</style>
			{/* Folder tab notched onto the top-left edge of the card. */}
			<div className="inline-flex items-center gap-1.5 rounded-t-lg border border-b-0 border-border bg-primary px-3 py-1.5 text-xs font-medium text-primary-front">
				<span
					aria-hidden
					className="flex h-3.5 w-3.5 items-center justify-center"
				>
					{tabIcon ?? <SparklesIcon className="h-3.5 w-3.5" />}
				</span>
				{tabLabel ?? t("agentPromptCard.tabLabel")}
			</div>

			<div className="rounded-xl rounded-tl-none border border-border bg-surface p-4 sm:p-5">
				<p className="text-sm text-muted">
					{instruction ?? t("agentPromptCard.instruction")}
				</p>

				<div className="mt-3 flex items-center gap-3 rounded-lg border border-border bg-surface-raised p-3 sm:p-4">
					<code className="min-w-0 flex-1 font-mono text-xs leading-relaxed break-words text-front sm:text-sm">
						{renderPrompt(prompt)}
					</code>
					<button
						aria-label={t("agentPromptCard.copyAria")}
						className="shrink-0 rounded-md p-1.5 text-muted transition-colors hover:bg-surface hover:text-front"
						type="button"
						onClick={handleCopy}
					>
						{copied ? (
							<ClipboardDocumentCheckIcon className="h-5 w-5 text-emerald-500" />
						) : (
							<ClipboardDocumentIcon className="h-5 w-5" />
						)}
					</button>
				</div>

				{/* Screen-reader announcement for the copy result. */}
				<span aria-live="polite" className="sr-only">
					{copied ? t("agentPromptCard.copied") : ""}
				</span>

				{agents.length > 0 ? (
					<div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
						<span className="text-xs text-subtle">
							{t("agentPromptCard.worksWith")}
						</span>
						<ul className="flex items-center gap-3">
							{agents.map((agent) => (
								<li
									key={agent.slug}
									aria-label={agent.name}
									className="group relative flex items-center"
								>
									{/* Two theme variants; CSS shows the one that suits the
									    current surface (see AGENT_LOGO_CSS). */}
									<img
										aria-hidden
										alt=""
										className="tp-agent-logo tp-agent-dark h-[18px] w-[18px] object-contain"
										loading="lazy"
										src={`/assets/agents/dark/${agent.slug}.png`}
									/>
									<img
										aria-hidden
										alt=""
										className="tp-agent-logo tp-agent-light h-[18px] w-[18px] object-contain"
										loading="lazy"
										src={`/assets/agents/light/${agent.slug}.png`}
									/>
									{/* Styled hover tooltip (replaces the native title). */}
									<span
										className="pointer-events-none absolute -top-9 left-1/2 z-10 -translate-x-1/2 translate-y-1 scale-95 rounded-md border border-border bg-surface-raised px-2 py-1 text-[11px] font-medium whitespace-nowrap text-front opacity-0 shadow-lg transition-all duration-150 group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100"
										role="tooltip"
									>
										{agent.name}
									</span>
								</li>
							))}
						</ul>
					</div>
				) : null}
			</div>
		</div>
	);
};
