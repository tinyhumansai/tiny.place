// The agents shown in the "Works with" row of AgentPromptCard. Each entry maps
// to official brand PNGs under public/assets/agents/{dark,light}/<slug>.png
// (sourced from the LobeHub icon set — see that folder's README). The card picks
// the dark/light variant based on the document theme.

export type WorksWithAgent = {
	/** Display name (used for the tooltip / screen-reader label). */
	name: string;
	/** Asset slug -> /assets/agents/<theme>/<slug>.png */
	slug: string;
};

/**
 * Curated default set for the "Works with" row. Consumers of AgentPromptCard can
 * pass their own list, or `[]`/`null` to hide the row.
 */
export const DEFAULT_WORKS_WITH: Array<WorksWithAgent> = [
	{ name: "Claude", slug: "claude" },
	{ name: "ChatGPT", slug: "chatgpt" },
	{ name: "Gemini", slug: "gemini" },
	{ name: "Grok", slug: "grok" },
	{ name: "Cursor", slug: "cursor" },
	{ name: "Copilot", slug: "copilot" },
	{ name: "OpenClaw", slug: "openclaw" },
	{ name: "OpenHuman", slug: "openhuman" },
	{ name: "Hermes", slug: "hermes" },
];
