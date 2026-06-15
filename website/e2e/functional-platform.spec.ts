import { expect, test } from "@playwright/test";
import { TinyPlaceClient } from "@tinyhumansai/tinyplace";

const API_URL = process.env.API_URL ?? "http://localhost:8080";
const SOLANA_URL = process.env.SOLANA_URL ?? "http://localhost:8899";
const PROGRAM_IDS = [
	"6s1cWEMcWjWZ3ut6aDD5g4CFBxpKBz5S4DLkrZdy5jR2",
	"7vXRCMe8jBcHT3zrgnW5mXLxBpWWKsBpn5XCCCnQpot8",
	"Ah7UYiQHzQ3T8D5PZpfbYttSras4t5dQyxevuEL1rHaY",
	"MfwLo55Nkv3SCQ2uFuoWXmAe7zJR6t3rMdm9K8Lr5Me",
];

type JSONRecord = Record<string, unknown>;

async function api(path: string, init?: RequestInit): Promise<Response> {
	return fetch(`${API_URL}${path}`, init);
}

async function apiJson(path: string): Promise<JSONRecord> {
	const response = await api(path);
	expect(response.status, path).toBe(200);
	expect(response.headers.get("content-type"), path).toContain(
		"application/json"
	);
	return (await response.json()) as JSONRecord;
}

async function apiText(path: string): Promise<string> {
	const response = await api(path);
	expect(response.status, path).toBe(200);
	return response.text();
}

async function solanaRpc<T>(
	method: string,
	params: Array<unknown> = []
): Promise<T> {
	const response = await fetch(SOLANA_URL, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
	});
	expect(response.ok).toBe(true);
	const body = (await response.json()) as { error?: unknown; result?: T };
	expect(body.error).toBeUndefined();
	return body.result as T;
}

function record(value: unknown): JSONRecord {
	expect(value).toEqual(expect.any(Object));
	return value as JSONRecord;
}

function pathOperation(
	paths: JSONRecord,
	path: string,
	method: string
): JSONRecord {
	const operations = record(paths[path]);
	return record(operations[method]);
}

function requestBodySchema(operation: JSONRecord): JSONRecord {
	const requestBody = record(operation.requestBody);
	const content = record(requestBody.content);
	const jsonContent = record(content["application/json"]);
	return record(jsonContent.schema);
}

function responseSchema(
	operation: JSONRecord,
	status: string,
	contentType = "application/json"
): JSONRecord {
	const responses = record(operation.responses);
	const response = record(responses[status]);
	const content = record(response.content);
	const typedContent = record(content[contentType]);
	return record(typedContent.schema);
}

test.describe("functional platform stack", () => {
	test.skip(
		!process.env.API_URL || !process.env.SOLANA_URL,
		"requires an explicit functional backend and Solana stack"
	);

	test("F001-F004: compose stack exposes backend, Solana programs, and frontend shell", async ({
		page,
	}) => {
		const health = await fetch(`${API_URL}/healthz`);
		expect(health.status).toBe(200);
		expect(health.headers.get("x-content-type-options")).toBe("nosniff");
		expect(health.headers.get("x-ratelimit-limit")).toMatch(/\d+/);
		expect(health.headers.get("access-control-allow-methods")).toMatch(/GET/);
		expect(health.headers.get("strict-transport-security")).toMatch(/max-age=/);
		await expect(await health.json()).toMatchObject({
			service: "tinyplace",
			status: "ok",
		});

		await expect.poll(async () => solanaRpc<string>("getHealth")).toBe("ok");
		const version = await solanaRpc<{ "solana-core": string }>("getVersion");
		expect(version["solana-core"]).toBeTruthy();
		const genesisHash = await solanaRpc<string>("getGenesisHash");
		expect(genesisHash).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,}$/);
		for (const programId of PROGRAM_IDS) {
			const account = await solanaRpc<{
				value: { executable: boolean } | null;
			}>("getAccountInfo", [programId, { encoding: "base64" }]);
			expect(account.value, `${programId} should be loaded`).not.toBeNull();
			expect(
				account.value?.executable,
				`${programId} should be executable`
			).toBe(true);
		}

		await page.goto("/");
		await expect(page).toHaveTitle(/tiny\.place|tiny/i);
		await expect(page.locator("body")).toContainText(/tiny/i);
		await expect(page.locator("body")).not.toContainText(
			/Unhandled Runtime Error|Application error|Internal Server Error/i
		);
	});

	test("F005: protocol spec index matches the backend module surface", async () => {
		const spec = await apiJson("/spec");
		expect(spec.name).toBe("tiny.place Network");
		expect(spec.documents).toEqual(expect.any(Array));
		expect(spec.documents).toHaveLength(38);
		expect(spec.documents).toEqual(
			expect.arrayContaining([
				"activity",
				"api",
				"architecture",
				"crypto-identity",
				"directory",
				"escrow",
				"games",
				"harness",
				"identity-registry",
				"jobs-marketplace",
				"ledger",
				"marketplace",
				"mcp-and-swagger",
				"messaging",
				"payments",
				"rate-limits-and-caching",
				"seo",
				"stats",
				"terms",
				"websocket",
			])
		);
	});

	test("F006-F009: docs and OpenAPI expose the complete route catalog", async () => {
		const docs = await apiText("/docs");
		expect(docs).toContain("/swagger.json");
		expect(docs).toContain("SwaggerUIBundle");

		const swagger = await apiJson("/swagger.json");
		const openapi = await apiJson("/openapi.json");
		expect(openapi).toEqual(swagger);
		expect(swagger.openapi).toBe("3.1.0");
		expect(swagger).not.toHaveProperty("swagger");
		expect(swagger).not.toHaveProperty("schemes");
		expect(swagger).not.toHaveProperty("host");
		expect(swagger).not.toHaveProperty("basePath");

		expect(swagger.servers).toEqual([
			{ url: "https://api.tiny.place", description: "Production" },
			{ url: "https://staging-api.tiny.place", description: "Staging" },
		]);

		const paths = record(swagger.paths);
		expect(Object.keys(paths).length).toBeGreaterThanOrEqual(160);
		for (const path of [
			"/healthz",
			"/spec",
			"/docs",
			"/swagger.json",
			"/openapi.json",
			"/swagger.yaml",
			"/registry/names/{id}/profile",
			"/users/{id}/profile",
			"/directory/agents/{id}",
			"/directory/groups/{id}/members/{id2}/subscription/renew",
			"/marketplace/products/{id}/download/{id2}",
			"/sitemap-{id}.xml",
			"/llms-full.txt",
		]) {
			expect(paths[path], `missing ${path}`).toBeDefined();
		}

		const components = record(swagger.components);
		const securitySchemes = record(components.securitySchemes);
		expect(securitySchemes.tinyplaceAuth).toBeDefined();
		expect(securitySchemes.x402Payment).toBeDefined();
		expect(securitySchemes.siwx).toBeDefined();

		const yaml = await apiText("/swagger.yaml");
		expect(yaml).toContain("openapi: 3.1.0");
		expect(yaml).toContain("/users/{id}/profile:");
		expect(yaml).toContain("/sitemap-{id}.xml:");
		expect(yaml).toContain("securitySchemes:");

		const profileGet = pathOperation(paths, "/users/{id}", "get");
		const profilePut = pathOperation(paths, "/users/{id}/profile", "put");
		expect(profileGet.summary).toBe("Get a wallet profile");
		expect(profilePut.summary).toBe("Update a wallet profile");
		expect(responseSchema(profileGet, "200").type).toBe("object");
		const profilePutSchema = requestBodySchema(profilePut);
		expect(profilePutSchema.type).toBe("object");
		const profilePutProperties = record(profilePutSchema.properties);
		expect(Object.keys(profilePutProperties)).toEqual(
			expect.arrayContaining([
				"actorType",
				"displayName",
				"bio",
				"avatar",
				"links",
				"tags",
				"signature",
			])
		);
		expect(record(profilePutProperties.actorType).enum).toEqual([
			"human",
			"agent",
		]);
		expect(record(record(profilePutProperties.links).items).type).toBe(
			"string"
		);
		expect(record(record(profilePutProperties.tags).items).type).toBe("string");

		const agentPut = pathOperation(paths, "/directory/agents/{id}", "put");
		expect(requestBodySchema(agentPut).$ref).toBe(
			"#/components/schemas/AgentCard"
		);
		expect(
			pathOperation(paths, "/marketplace/products/{id}/buy", "post")
		).toHaveProperty("requestBody");
	});

	test("F010-F011: SDK docs client fetches crawler and legal documents", async () => {
		const client = new TinyPlaceClient({ baseUrl: API_URL });

		const constitution = await client.docs.constitution();
		expect(constitution.version).toBeTruthy();
		expect(constitution.effectiveDate).toBeTruthy();
		expect(constitution.rules.length).toBeGreaterThan(0);

		const terms = await client.docs.terms();
		expect(terms).toMatchObject({
			version: expect.any(String),
			effectiveDate: expect.any(String),
			title: expect.any(String),
			text: expect.any(String),
		});
		expect(terms.text.length).toBeGreaterThan(100);

		const termsHistory = await client.docs.termsHistory();
		expect(termsHistory.terms.length).toBeGreaterThan(0);
		expect(termsHistory.terms[0]?.version).toBeTruthy();

		const robots = await client.docs.robots();
		expect(robots).toContain("User-agent: *");
		expect(robots).toContain("Disallow: /admin/");
		expect(robots).toContain("Allow: /sitemap.xml");

		const sitemap = await client.docs.sitemap();
		expect(sitemap).toContain("<sitemapindex");
		for (const name of [
			"agents",
			"groups",
			"broadcasts",
			"channels",
			"events",
			"marketplace",
			"identities",
			"transactions",
			"stats",
		]) {
			expect(sitemap).toContain(`/sitemap-${name}.xml`);
			const part = await client.docs.sitemapPart(name);
			expect(part).toContain("<urlset");
			expect(part.length).toBeLessThan(50 * 1024 * 1024);
			expect((part.match(/<url>/g) ?? []).length).toBeLessThanOrEqual(50_000);
		}

		const llms = await client.docs.llms();
		expect(llms).toContain("# tiny.place Network");
		expect(llms).toContain("Private encrypted content");
		expect(llms.length).toBeLessThan(64 * 1024);

		const llmsFull = await client.docs.llmsFull();
		expect(llmsFull).toContain("Extended Context");
		expect(llmsFull).toContain("Signal Protocol");
		expect(llmsFull.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(
			100_000
		);

		const groupPage = await client.docs.groupPage("group_research");
		expect(groupPage).toContain("noindex");
		expect(groupPage).toContain("group_research");

		const identityPage = await client.docs.identityPage("@alice");
		expect(identityPage).toContain("noindex");
		expect(identityPage).toContain("@alice");
	});

	test("F012: discovery static assets are GET/HEAD only", async () => {
		for (const asset of [
			{ path: "/favicon.svg", contentType: "image/svg+xml" },
			{ path: "/site.webmanifest", contentType: "application/manifest+json" },
			{ path: "/web-app-manifest-192x192.png", contentType: "image/png" },
		]) {
			const get = await api(asset.path);
			expect(get.status, `${asset.path} GET`).toBe(200);
			expect(get.headers.get("content-type")).toContain(asset.contentType);
			expect(await get.text()).not.toHaveLength(0);

			const head = await api(asset.path, { method: "HEAD" });
			expect(head.status, `${asset.path} HEAD`).toBe(200);
			expect(head.headers.get("content-type")).toContain(asset.contentType);
			expect(await head.text()).toHaveLength(0);

			for (const method of ["POST", "PUT", "DELETE"]) {
				const rejected = await api(asset.path, { method });
				expect(rejected.status, `${asset.path} ${method}`).toBe(405);
				expect(rejected.headers.get("allow")).toBe("GET, HEAD");
			}
		}
	});
});
