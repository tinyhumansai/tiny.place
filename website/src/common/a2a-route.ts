/* eslint-disable no-use-before-define -- small pure helpers are function declarations */

type Fetcher = typeof fetch;

export const A2A_API_BASE_URL =
	process.env["NEXT_PUBLIC_API_BASE_URL"] ?? "https://staging-api.tiny.place";

export type A2aAgentCard = {
	agentId: string;
	cryptoId: string;
	docs?: {
		skillMd?: string;
		skillMdUrl?: string;
		swaggerJson?: string;
		swaggerJsonUrl?: string;
		swaggerMd?: string;
		swaggerMdUrl?: string;
	};
	name: string;
	url?: string;
	[key: string]: unknown;
};

type ResolveResponse = {
	agent?: A2aAgentCard | null;
	identity?: { cryptoId?: string | null } | null;
};

type DocumentKind = "skillMd" | "swaggerJson" | "swaggerMd";

const DOCUMENT_FILENAMES: Record<DocumentKind, string> = {
	skillMd: "skill.md",
	swaggerJson: "swagger.json",
	swaggerMd: "swagger.md",
};

const DOCUMENT_CONTENT_TYPES: Record<DocumentKind, string> = {
	skillMd: "text/markdown; charset=utf-8",
	swaggerJson: "application/json; charset=utf-8",
	swaggerMd: "text/markdown; charset=utf-8",
};

export async function resolveA2aAgentCard(
	id: string,
	fetcher: Fetcher = fetch,
	apiBaseUrl = A2A_API_BASE_URL
): Promise<A2aAgentCard | null> {
	const normalized = decodeRouteId(id);
	if (normalized === "") {
		return null;
	}

	if (normalized.startsWith("@")) {
		const resolved = await fetchJson<ResolveResponse>(
			`${apiBaseUrl}/directory/resolve/${encodeURIComponent(normalized)}`,
			fetcher
		);
		if (!resolved) {
			return null;
		}
		if (resolved.agent) {
			return resolved.agent;
		}
		const cryptoId = resolved.identity?.cryptoId;
		return cryptoId ? fetchAgentCard(cryptoId, fetcher, apiBaseUrl) : null;
	}

	return fetchAgentCard(normalized, fetcher, apiBaseUrl);
}

export function agentCardResponse(card: A2aAgentCard): Response {
	return Response.json(card, {
		headers: {
			"Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
		},
	});
}

export function agentDocumentResponse(
	card: A2aAgentCard,
	kind: DocumentKind
): Response {
	const inline = inlineDocument(card, kind);
	if (inline !== undefined) {
		return new Response(inline, {
			headers: {
				"Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
				"Content-Type": DOCUMENT_CONTENT_TYPES[kind],
			},
		});
	}

	const url = agentDocumentUrl(card, kind);
	if (!url) {
		return notFound();
	}

	return new Response(null, {
		status: 302,
		headers: {
			"Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
			Location: url,
		},
	});
}

export function agentDocumentUrl(
	card: A2aAgentCard,
	kind: DocumentKind
): string | null {
	const documentation = card.docs;
	const urlField = `${kind}Url` as keyof NonNullable<A2aAgentCard["docs"]>;
	const advertisedUrl = documentation?.[urlField];
	if (typeof advertisedUrl === "string" && isDocumentUrl(advertisedUrl)) {
		return advertisedUrl;
	}

	const advertisedValue = documentation?.[kind];
	if (typeof advertisedValue === "string" && isDocumentUrl(advertisedValue)) {
		return advertisedValue;
	}

	if (card.url && isHttpUrl(card.url)) {
		return new URL(DOCUMENT_FILENAMES[kind], card.url).toString();
	}

	return null;
}

export function notFound(): Response {
	return new Response("Not found", {
		status: 404,
		headers: { "Content-Type": "text/plain; charset=utf-8" },
	});
}

function inlineDocument(
	card: A2aAgentCard,
	kind: DocumentKind
): string | undefined {
	const value = card.docs?.[kind];
	if (typeof value === "string" && !isDocumentUrl(value)) {
		return value;
	}
	return undefined;
}

async function fetchAgentCard(
	agentId: string,
	fetcher: Fetcher,
	apiBaseUrl: string
): Promise<A2aAgentCard | null> {
	return fetchJson<A2aAgentCard>(
		`${apiBaseUrl}/directory/agents/${encodeURIComponent(agentId)}`,
		fetcher
	);
}

async function fetchJson<T>(url: string, fetcher: Fetcher): Promise<T | null> {
	const response = await fetcher(url, {
		headers: { Accept: "application/json" },
	});
	if (response.status === 404) {
		return null;
	}
	if (!response.ok) {
		throw new Error(`A2A directory lookup failed: HTTP ${response.status}`);
	}
	return (await response.json()) as T;
}

function decodeRouteId(id: string): string {
	try {
		return decodeURIComponent(id).trim();
	} catch {
		return id.trim();
	}
}

function isHttpUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return url.protocol === "http:" || url.protocol === "https:";
	} catch {
		return false;
	}
}

function isDocumentUrl(value: string): boolean {
	return isHttpUrl(value) || isRelativePath(value);
}

function isRelativePath(value: string): boolean {
	return value.startsWith("/") && !value.startsWith("//");
}
