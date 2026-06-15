import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as SolanaRpc from "./solana-rpc";

type SolanaRpcModule = typeof SolanaRpc;

async function loadModule(): Promise<SolanaRpcModule> {
	vi.resetModules();
	return import("./solana-rpc");
}

function stubFetch(
	implementation: (
		input: RequestInfo | URL,
		init?: RequestInit
	) => Promise<Response>
): void {
	vi.stubGlobal("fetch", vi.fn(implementation));
}

function requestUrl(input: RequestInfo | URL): string {
	if (typeof input === "string") {
		return input;
	}
	if (input instanceof URL) {
		return input.href;
	}
	return input.url;
}

function fetchCalls(): Array<string> {
	const fetchMock = vi.mocked(fetch);
	return fetchMock.mock.calls.map(([input]) => requestUrl(input));
}

describe("solana rpc fallback", () => {
	beforeEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
		vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example");
		vi.stubEnv("NEXT_PUBLIC_SOLANA_RPC_URL", "https://primary.example");
	});

	it("uses the configured primary rpc when it succeeds", async () => {
		const { solanaRpcFetch } = await loadModule();
		stubFetch(
			(): Promise<Response> => Promise.resolve(Response.json({ result: "ok" }))
		);

		const response = await solanaRpcFetch("https://primary.example", {
			method: "POST",
		});

		await expect(response.json()).resolves.toEqual({ result: "ok" });
		expect(fetchCalls()).toEqual(["https://primary.example"]);
	});

	it("falls back to the backend solana rpc proxy after a network failure", async () => {
		const { solanaRpcFetch } = await loadModule();
		stubFetch((input): Promise<Response> => {
			if (requestUrl(input) === "https://primary.example") {
				return Promise.reject(new TypeError("primary unavailable"));
			}
			return Promise.resolve(Response.json({ result: "fallback" }));
		});

		const response = await solanaRpcFetch("https://primary.example", {
			method: "POST",
		});

		await expect(response.json()).resolves.toEqual({ result: "fallback" });
		expect(fetchCalls()).toEqual([
			"https://primary.example",
			"https://api.example/solana/rpc",
		]);
	});

	it("falls back to the backend solana rpc proxy after a rate limit", async () => {
		const { solanaRpcFetch } = await loadModule();
		stubFetch((input): Promise<Response> => {
			if (requestUrl(input) === "https://primary.example") {
				return Promise.resolve(
					new Response("too many requests", { status: 429 })
				);
			}
			return Promise.resolve(Response.json({ result: "fallback" }));
		});

		const response = await solanaRpcFetch("https://primary.example", {
			method: "POST",
		});

		await expect(response.json()).resolves.toEqual({ result: "fallback" });
		expect(fetchCalls()).toEqual([
			"https://primary.example",
			"https://api.example/solana/rpc",
		]);
	});

	it("falls back when the primary returns a json-rpc rate-limit error", async () => {
		const { solanaRpcFetch } = await loadModule();
		stubFetch((input): Promise<Response> => {
			if (requestUrl(input) === "https://primary.example") {
				return Promise.resolve(
					Response.json({
						jsonrpc: "2.0",
						id: 1,
						error: { code: -32005, message: "rate limited" },
					})
				);
			}
			return Promise.resolve(Response.json({ result: "fallback" }));
		});

		const response = await solanaRpcFetch("https://primary.example", {
			method: "POST",
		});

		await expect(response.json()).resolves.toEqual({ result: "fallback" });
		expect(fetchCalls()).toEqual([
			"https://primary.example",
			"https://api.example/solana/rpc",
		]);
	});
});
