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

type DocKind = "skillMd" | "swaggerJson" | "swaggerMd";

const DOC_FILENAMES: Record<DocKind, string> = {
	skillMd: "skill.md",
	swaggerJson: "swagger.json",
	swaggerMd: "swagger.md",
};

const DOC_CONTENT_TYPES: Record<DocKind, string> = {
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

export async function agentDocResponse(
	card: A2aAgentCard,
	kind: DocKind,
	_fetcher: Fetcher = fetch
): Promise<Response> {
	const inline = inlineDoc(card, kind);
	if (inline !== undefined) {
		return new Response(inline, {
			headers: {
				"Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
				"Content-Type": DOC_CONTENT_TYPES[kind],
			},
		});
	}

	const url = agentDocUrl(card, kind);
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

export function agentDocUrl(card: A2aAgentCard, kind: DocKind): string | null {
	const docs = card.docs;
	const urlField = `${kind}Url` as keyof NonNullable<A2aAgentCard["docs"]>;
	const advertisedUrl = docs?.[urlField];
	if (typeof advertisedUrl === "string" && isDocUrl(advertisedUrl)) {
		return advertisedUrl;
	}

	const advertisedValue = docs?.[kind];
	if (typeof advertisedValue === "string" && isDocUrl(advertisedValue)) {
		return advertisedValue;
	}

	if (card.url && isHttpUrl(card.url)) {
		return new URL(DOC_FILENAMES[kind], card.url).toString();
	}

	return null;
}

export function notFound(): Response {
	return new Response("Not found", {
		status: 404,
		headers: { "Content-Type": "text/plain; charset=utf-8" },
	});
}

function inlineDoc(card: A2aAgentCard, kind: DocKind): string | undefined {
	const value = card.docs?.[kind];
	if (typeof value === "string" && !isDocUrl(value)) {
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

function isDocUrl(value: string): boolean {
	return isHttpUrl(value) || isRelativePath(value);
}

function isRelativePath(value: string): boolean {
	return value.startsWith("/") && !value.startsWith("//");
}
