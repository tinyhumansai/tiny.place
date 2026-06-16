import { expect, test } from "@playwright/test";
import {
	LocalSigner,
	signDirectoryWrite,
	TinyPlaceClient,
	TinyPlaceError,
} from "@tinyhumansai/tinyplace";

const API_URL = process.env.API_URL ?? "http://localhost:8080";
const SOLANA_URL = process.env.SOLANA_URL ?? "http://localhost:8899";
const PROGRAM_IDS = [
	"6s1cWEMcWjWZ3ut6aDD5g4CFBxpKBz5S4DLkrZdy5jR2",
	"7vXRCMe8jBcHT3zrgnW5mXLxBpWWKsBpn5XCCCnQpot8",
	"Ah7UYiQHzQ3T8D5PZpfbYttSras4t5dQyxevuEL1rHaY",
	"MfwLo55Nkv3SCQ2uFuoWXmAe7zJR6t3rMdm9K8Lr5Me",
];

type JSONRecord = Record<string, unknown>;
type StreamFrame = { type?: string; data?: unknown };

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

function uniq(prefix: string): string {
	return `${prefix}-${Date.now().toString(36)}-${Math.random()
		.toString(36)
		.slice(2, 8)}`;
}

function isTinyPlaceStatus(error: unknown, status: number): boolean {
	return error instanceof TinyPlaceError && error.status === status;
}

function tinyPlaceBody(error: unknown): JSONRecord {
	expect(error).toBeInstanceOf(TinyPlaceError);
	return record((error as TinyPlaceError).body);
}

function bytesToBase64(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary);
}

async function sha256Hex(body: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(body)
	);
	return Array.from(new Uint8Array(digest))
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

async function signedDirectoryHeaders(
	signer: LocalSigner,
	method: string,
	requestUri: string,
	body: string,
	options?: { timestamp?: string; nonce?: string }
): Promise<Record<string, string>> {
	const timestamp = options?.timestamp ?? new Date().toISOString();
	const nonce = options?.nonce ?? uniq("nonce");
	const bodyHash = await sha256Hex(body);
	const payload = `${method}\n${requestUri}\n${timestamp}\n${nonce}\n${bodyHash}`;
	const signature = await signer.sign(new TextEncoder().encode(payload));
	return {
		"Content-Type": "application/json",
		"X-TinyPlace-Date": timestamp,
		"X-TinyPlace-Nonce": nonce,
		"X-TinyPlace-Public-Key": signer.publicKeyBase64,
		"X-TinyPlace-Signature": bytesToBase64(signature),
	};
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

type McpResponse = {
	body: JSONRecord;
	sessionId: string | null;
};

async function mcp(
	message: JSONRecord,
	sessionId?: string
): Promise<McpResponse> {
	const response = await api("/mcp", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
		},
		body: JSON.stringify(message),
	});
	expect(response.status, JSON.stringify(message)).toBe(200);
	expect(response.headers.get("content-type")).toContain("application/json");
	return {
		body: (await response.json()) as JSONRecord,
		sessionId: response.headers.get("Mcp-Session-Id"),
	};
}

function mcpResult(response: McpResponse): JSONRecord {
	expect(response.body.error).toBeUndefined();
	return record(response.body.result);
}

function mcpError(response: McpResponse): JSONRecord {
	expect(response.body.result).toBeUndefined();
	return record(response.body.error);
}

function mcpTextContent(result: JSONRecord): string {
	const content = result.content;
	expect(content).toEqual(expect.any(Array));
	const first = record((content as Array<unknown>)[0]);
	expect(first.type).toBe("text");
	expect(first.text).toEqual(expect.any(String));
	return first.text as string;
}

async function mcpStreamText(
	sessionId: string,
	resource?: string
): Promise<string> {
	const params = new URLSearchParams();
	if (resource) {
		params.set("resource", resource);
	}
	const controller = new AbortController();
	const response = await api(`/mcp${params.size ? `?${params}` : ""}`, {
		headers: { "Mcp-Session-Id": sessionId },
		signal: controller.signal,
	});
	expect(response.status).toBe(200);
	expect(response.headers.get("content-type")).toContain("text/event-stream");
	expect(response.headers.get("Mcp-Session-Id")).toBe(sessionId);
	const reader = response.body?.getReader();
	expect(reader).toBeDefined();
	const decoder = new TextDecoder();
	let text = "";
	try {
		const first = await reader!.read();
		if (!first.done) {
			text += decoder.decode(first.value, { stream: true });
		}
	} finally {
		controller.abort();
		reader?.releaseLock();
	}
	return text;
}

function waitForStreamMessage(
	socket: NonNullable<ReturnType<TinyPlaceClient["a2a"]["stream"]>>
): Promise<StreamFrame> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			cleanup();
			reject(new Error("timed out waiting for A2A stream message"));
		}, 5000);
		const offMessage = socket.on<StreamFrame>("message", (message) => {
			cleanup();
			resolve(message);
		});
		const offError = socket.on("error", (error) => {
			cleanup();
			reject(error instanceof Error ? error : new Error(String(error)));
		});
		function cleanup(): void {
			clearTimeout(timer);
			offMessage();
			offError();
		}
	});
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

	test("F013-F017,F020-F022,F024-F025: MCP transport, catalogs, dispatch, resources, and prompts work live", async () => {
		const client = new TinyPlaceClient({ baseUrl: API_URL });
		const initialized = await client.mcp.initialize();
		const sessionId = initialized.sessionId;
		expect(sessionId).toMatch(/^tinyplace-\d+-\d+$/);
		expect(initialized.body.result).toMatchObject({
			protocolVersion: "2025-03-26",
			serverInfo: { name: "tinyplace", version: "1.0.0" },
		});
		expect(
			record(record(initialized.body.result).capabilities).resources
		).toEqual(expect.objectContaining({ subscribe: true, listChanged: true }));

		const tools = await client.mcp.listTools({ sessionId: sessionId! });
		expect(tools.sessionId).toBe(sessionId);
		const toolRows = record(tools.body.result).tools as Array<JSONRecord>;
		const toolsByName = new Map(
			toolRows.map((tool) => [tool.name as string, tool])
		);
		for (const name of [
			"tinyplace_system_health",
			"tinyplace_directory_search",
			"tinyplace_register",
			"tinyplace_payments_verify",
			"tinyplace_signer_create",
			"tinyplace_signer_revoke",
			"tinyplace_escrow_create",
			"tinyplace_escrow_dispute_vote",
			"tinyplace_ledger",
		]) {
			expect(toolsByName.get(name), `missing MCP tool ${name}`).toBeDefined();
		}
		expect(toolsByName.get("tinyplace_system_health")).toMatchObject({
			authRequired: false,
			route: "GET /healthz",
		});
		expect(toolsByName.get("tinyplace_register")).toMatchObject({
			authRequired: true,
			route: "POST /registry/names",
		});
		expect(toolsByName.get("tinyplace_signer_create")).toMatchObject({
			authRequired: true,
			route: "POST /signers",
		});
		expect(toolsByName.get("tinyplace_escrow_create")).toMatchObject({
			authRequired: true,
			route: "POST /escrow",
		});
		expect(toolsByName.get("tinyplace_ledger")).toMatchObject({
			authRequired: false,
			route: "GET /ledger/transactions",
		});

		const resources = await client.mcp.listResources({ sessionId: sessionId! });
		expect(resources.sessionId).toBe(sessionId);
		const resourceRows = record(resources.body.result)
			.resources as Array<JSONRecord>;
		expect(resourceRows).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					uri: "tinyplace://ledger/recent",
					subscribable: true,
				}),
				expect.objectContaining({
					uri: "tinyplace://stats/overview",
					subscribable: true,
				}),
				expect.objectContaining({
					uri: "tinyplace://inbox",
					subscribable: true,
				}),
			])
		);

		const prompts = await client.mcp.listPrompts({ sessionId: sessionId! });
		expect(prompts.sessionId).toBe(sessionId);
		const promptRows = record(prompts.body.result).prompts as Array<JSONRecord>;
		expect(promptRows).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ name: "discover-agent" }),
				expect.objectContaining({ name: "send-payment" }),
				expect.objectContaining({ name: "marketplace-search" }),
			])
		);

		const healthCall = mcpResult(
			await mcp(
				{
					jsonrpc: "2.0",
					id: "health",
					method: "tools/call",
					params: { name: "tinyplace_system_health", arguments: {} },
				},
				sessionId!
			)
		);
		expect(healthCall.status).toBe(200);
		expect(healthCall.contentType).toContain("application/json");
		expect(JSON.parse(mcpTextContent(healthCall))).toMatchObject({
			service: "tinyplace",
			status: "ok",
		});

		const authError = mcpError(
			await mcp(
				{
					jsonrpc: "2.0",
					id: "auth-required",
					method: "tools/call",
					params: { name: "tinyplace_register", arguments: { body: {} } },
				},
				sessionId!
			)
		);
		expect(authError).toMatchObject({
			code: -32001,
			message: "authorization required",
		});

		const resourceRead = mcpResult(
			await mcp(
				{
					jsonrpc: "2.0",
					id: "read-stats",
					method: "resources/read",
					params: { uri: "tinyplace://stats/overview" },
				},
				sessionId!
			)
		);
		expect(resourceRead.status).toBe(200);
		const contents = resourceRead.contents as Array<JSONRecord>;
		expect(contents[0]).toMatchObject({
			uri: "tinyplace://stats/overview",
		});
		expect(JSON.parse(contents[0]?.text as string)).toEqual(expect.any(Object));

		const subscription = mcpResult(
			await mcp(
				{
					jsonrpc: "2.0",
					id: "subscribe",
					method: "resources/subscribe",
					params: { uri: "tinyplace://stats/overview" },
				},
				sessionId!
			)
		);
		expect(subscription).toEqual({
			uri: "tinyplace://stats/overview",
			subscribed: true,
		});
		const subscribedStream = await mcpStreamText(sessionId!);
		expect(subscribedStream).toContain("notifications/tinyplace/connected");
		expect(subscribedStream).toContain("notifications/resources/updated");
		expect(subscribedStream).toContain("tinyplace://stats/overview");

		const isolated = await mcpStreamText("isolated-functional-session");
		expect(isolated).toContain("notifications/tinyplace/connected");
		expect(isolated).not.toContain("tinyplace://stats/overview");

		const unsubscribed = mcpResult(
			await mcp(
				{
					jsonrpc: "2.0",
					id: "unsubscribe",
					method: "resources/unsubscribe",
					params: { uri: "tinyplace://stats/overview" },
				},
				sessionId!
			)
		);
		expect(unsubscribed).toEqual({
			uri: "tinyplace://stats/overview",
			subscribed: false,
		});

		const renderedPrompt = mcpResult(
			await mcp(
				{
					jsonrpc: "2.0",
					id: "prompt",
					method: "prompts/get",
					params: {
						name: "send-payment",
						arguments: { recipient: "@seller", amount: "1 SOL" },
					},
				},
				sessionId!
			)
		);
		expect(renderedPrompt.description).toBe("Walk through sending a payment.");
		expect(JSON.stringify(renderedPrompt.messages)).toContain("@seller");
		expect(JSON.stringify(renderedPrompt.messages)).toContain("1 SOL");

		const promptError = mcpError(
			await mcp(
				{
					jsonrpc: "2.0",
					id: "prompt-error",
					method: "prompts/get",
					params: { name: "missing-prompt" },
				},
				sessionId!
			)
		);
		expect(promptError).toMatchObject({
			code: -32602,
			message: "unknown prompt",
		});

		const terminated = await client.mcp.terminate({ sessionId: sessionId! });
		expect(terminated.status).toBe("terminated");
		const afterTerminate = await mcpStreamText(sessionId!);
		expect(afterTerminate).toContain("notifications/tinyplace/connected");
		expect(afterTerminate).not.toContain("tinyplace://stats/overview");
	});

	test("F026-F028: A2A docs, signed JSON-RPC relay, stream auth, and wire errors work live", async () => {
		const signer = await LocalSigner.generate();
		const client = new TinyPlaceClient({ baseUrl: API_URL, signer });
		const agentName = uniq("functional-a2a-agent");
		const skillDoc = `# ${agentName}\n\n## Skill\n\nEcho signed JSON-RPC tasks.`;
		const swaggerMarkdown = `# ${agentName} API\n\nPOST /task`;
		const swaggerJson = {
			openapi: "3.1.0",
			info: { title: agentName, version: "1.0.0" },
			paths: { "/task": { post: { summary: "Run task" } } },
		};
		const now = new Date().toISOString();

		await client.directory.upsertAgent(signer.agentId, {
			agentId: signer.agentId,
			cryptoId: signer.agentId,
			name: agentName,
			description: "Functional A2A agent with inline docs",
			publicKey: signer.publicKeyBase64,
			url: `${API_URL}/a2a/${encodeURIComponent(signer.agentId)}`,
			skills: ["echo"],
			capabilities: ["streaming", "json-rpc"],
			tags: ["functional", "a2a"],
			docs: {
				skillMd: skillDoc,
				swaggerMd: swaggerMarkdown,
				swaggerJson: JSON.stringify(swaggerJson),
			},
			createdAt: now,
			updatedAt: now,
		});

		try {
			const fetched = await client.directory.getAgent(signer.agentId);
			expect(fetched).toMatchObject({
				agentId: signer.agentId,
				name: agentName,
				cryptoId: signer.agentId,
				publicKey: signer.publicKeyBase64,
			});
			expect(fetched.docs?.skillMdUrl).toBe(
				`/a2a/${signer.agentId}/skill.md`
			);
			expect(fetched.docs?.swaggerJsonUrl).toBe(
				`/a2a/${signer.agentId}/swagger.json`
			);
			expect(fetched.docs?.swaggerMdUrl).toBe(
				`/a2a/${signer.agentId}/swagger.md`
			);

			await expect(client.a2a.skillDescription(signer.agentId)).resolves.toBe(
				skillDoc
			);
			await expect(client.a2a.swaggerMarkdown(signer.agentId)).resolves.toBe(
				swaggerMarkdown
			);
			await expect(client.a2a.swagger(signer.agentId)).resolves.toEqual(
				swaggerJson
			);

			let unsupported: JSONRecord | undefined;
			try {
				await client.a2a.sendTask(
					signer.agentId,
					{
						jsonrpc: "2.0",
						id: "unsupported",
						method: "tasks/unknown",
						params: { message: "hello" },
					},
					signer.publicKeyBase64
				);
			} catch (error) {
				expect(isTinyPlaceStatus(error, 404)).toBe(true);
				unsupported = tinyPlaceBody(error);
			}
			expect(unsupported).toMatchObject({
				jsonrpc: "2.0",
				id: "unsupported",
				error: {
					code: -32601,
					message: "method not found",
					data: { method: "tasks/unknown" },
				},
			});

			let taskRelay: JSONRecord | undefined;
			try {
				await client.a2a.sendTask(
					signer.agentId,
					{
						jsonrpc: "2.0",
						id: "task-required-envelope",
						method: "tasks/send",
						params: { message: { role: "user", parts: [] } },
					},
					signer.publicKeyBase64
				);
			} catch (error) {
				expect(isTinyPlaceStatus(error, 400)).toBe(true);
				taskRelay = tinyPlaceBody(error);
			}
			expect(taskRelay).toMatchObject({
				jsonrpc: "2.0",
				id: "task-required-envelope",
				error: {
					code: -32600,
					message: "encrypted MessageEnvelope required",
					data: { to: signer.agentId },
				},
			});

			const unsigned = new TinyPlaceClient({ baseUrl: API_URL });
			let unsignedRelay: JSONRecord | undefined;
			try {
				await unsigned.a2a.sendTask(signer.agentId, {
					jsonrpc: "2.0",
					id: "missing-sender",
					method: "tasks/send",
					params: {},
				});
			} catch (error) {
				expect(isTinyPlaceStatus(error, 400)).toBe(true);
				unsignedRelay = tinyPlaceBody(error);
			}
			expect(unsignedRelay).toMatchObject({
				jsonrpc: "2.0",
				id: "missing-sender",
				error: {
					code: -32600,
					message: "sender is required",
				},
			});

			const stream = client.a2a.stream(signer.agentId);
			expect(stream).toBeDefined();
			const firstMessage = waitForStreamMessage(stream!);
			await stream!.connect();
			const snapshot = await firstMessage;
			expect(snapshot.type).toBe("snapshot");
			expect(snapshot.data === null || Array.isArray(snapshot.data)).toBe(true);
			stream!.close();

			const unsignedStream = unsigned.a2a.stream(signer.agentId);
			expect(unsignedStream).toBeDefined();
			await expect(unsignedStream!.connect()).rejects.toBeTruthy();
			unsignedStream!.close();
		} finally {
			try {
				await client.directory.deleteAgent(signer.agentId);
			} catch (error) {
				if (!isTinyPlaceStatus(error, 404)) {
					throw error;
				}
			}
		}
	});

	test("F034-F036: directory auth binds request details and rejects replayed or stale signatures", async () => {
		const signer = await LocalSigner.generate();
		const client = new TinyPlaceClient({ baseUrl: API_URL, signer });
		const requestUri = `/directory/agents/${encodeURIComponent(signer.agentId)}`;
		const now = new Date().toISOString();
		const card = {
			agentId: signer.agentId,
			cryptoId: signer.agentId,
			name: uniq("functional-auth-agent"),
			description: "Functional auth signature probe",
			publicKey: signer.publicKeyBase64,
			url: `${API_URL}/a2a/${encodeURIComponent(signer.agentId)}`,
			skills: ["auth"],
			capabilities: ["directory-write"],
			tags: ["functional", "auth"],
			createdAt: now,
			updatedAt: now,
		};
		const body = JSON.stringify(card);
		const replayHeaders = await signDirectoryWrite(
			signer,
			signer.publicKeyBase64,
			"PUT",
			requestUri,
			body
		);
		const headers = {
			"Content-Type": "application/json",
			...replayHeaders,
		};

		try {
			const created = await api(requestUri, {
				method: "PUT",
				headers,
				body,
			});
			expect(created.status).toBe(200);
			await expect(created.json()).resolves.toMatchObject({
				agentId: signer.agentId,
				name: card.name,
			});

			const replayed = await api(requestUri, {
				method: "PUT",
				headers,
				body,
			});
			expect(replayed.status).toBe(403);
			await expect(replayed.json()).resolves.toMatchObject({
				error: "directory write signature required",
			});

			const signedOriginal = await signDirectoryWrite(
				signer,
				signer.publicKeyBase64,
				"PUT",
				requestUri,
				body
			);
			const tampered = await api(requestUri, {
				method: "PUT",
				headers: {
					"Content-Type": "application/json",
					...signedOriginal,
				},
				body: JSON.stringify({ ...card, name: `${card.name}-tampered` }),
			});
			expect(tampered.status).toBe(403);

			const staleBody = JSON.stringify({
				...card,
				name: `${card.name}-stale`,
			});
			const stale = await api(requestUri, {
				method: "PUT",
				headers: await signedDirectoryHeaders(
					signer,
					"PUT",
					requestUri,
					staleBody,
					{
						timestamp: new Date(Date.now() - 10 * 60_000).toISOString(),
						nonce: uniq("stale"),
					}
				),
				body: staleBody,
			});
			expect(stale.status).toBe(403);

			const missingNonceBody = JSON.stringify({
				...card,
				name: `${card.name}-missing-nonce`,
			});
			const missingNonce = await api(requestUri, {
				method: "PUT",
				headers: await signedDirectoryHeaders(
					signer,
					"PUT",
					requestUri,
					missingNonceBody,
					{ nonce: "" }
				),
				body: missingNonceBody,
			});
			expect(missingNonce.status).toBe(403);

			const unsignedStream = new TinyPlaceClient({ baseUrl: API_URL }).a2a.stream(
				signer.agentId
			);
			expect(unsignedStream).toBeDefined();
			await expect(unsignedStream!.connect()).rejects.toBeTruthy();
			unsignedStream!.close();
		} finally {
			try {
				await client.directory.deleteAgent(signer.agentId);
			} catch (error) {
				if (!isTinyPlaceStatus(error, 404)) {
					throw error;
				}
			}
		}
	});
});
