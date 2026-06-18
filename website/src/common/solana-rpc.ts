import {
	clusterApiUrl,
	Connection,
	type Cluster,
	type ConnectionConfig,
	type FetchFn,
} from "@solana/web3.js";

const API_BASE_URL =
	process.env["NEXT_PUBLIC_API_BASE_URL"] ?? "https://staging-api.tiny.place";
const SOLANA_NETWORK = (process.env["NEXT_PUBLIC_SOLANA_NETWORK"] ??
	"devnet") as Cluster;
const SOLANA_RPC_URL = process.env["NEXT_PUBLIC_SOLANA_RPC_URL"]?.trim() ?? "";
const SOLANA_RPC_PROXY_PATH = "/solana/rpc";

type JsonObject = Record<string, unknown>;

function fetchInputUrl(input: Parameters<FetchFn>[0]): string {
	if (typeof input === "string") {
		return input;
	}
	if (input instanceof URL) {
		return input.href;
	}
	return input.url;
}

function trimTrailingSlash(value: string): string {
	return value.replace(/\/+$/, "");
}

function isJsonObject(value: unknown): value is JsonObject {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonRpcErrorCode(value: unknown): number | undefined {
	if (!isJsonObject(value)) {
		return undefined;
	}
	const error = value["error"];
	if (!isJsonObject(error)) {
		return undefined;
	}
	const code = error["code"];
	return typeof code === "number" ? code : undefined;
}

function isRetryableRpcErrorCode(code: number | undefined): boolean {
	return code === -32005 || code === 429;
}

async function hasRetryableRpcError(response: Response): Promise<boolean> {
	if (!response.ok) {
		return false;
	}

	try {
		const body: unknown = await response.clone().json();
		if (Array.isArray(body)) {
			return body.some((entry) =>
				isRetryableRpcErrorCode(jsonRpcErrorCode(entry))
			);
		}
		return isRetryableRpcErrorCode(jsonRpcErrorCode(body));
	} catch {
		return false;
	}
}

function shouldFallback(response: Response): boolean {
	return response.status === 429 || response.status >= 500;
}

export function solanaRpcProxyUrl(): string {
	return `${trimTrailingSlash(API_BASE_URL)}${SOLANA_RPC_PROXY_PATH}`;
}

export function primarySolanaRpcUrl(): string {
	return SOLANA_RPC_URL || clusterApiUrl(SOLANA_NETWORK);
}

/** The active Solana cluster (`devnet` | `mainnet-beta` | `testnet`). */
export function solanaCluster(): Cluster {
	return SOLANA_NETWORK;
}

export function solanaRpcEndpoints(): Array<string> {
	const primary = primarySolanaRpcUrl();
	const fallback = solanaRpcProxyUrl();
	return primary === fallback ? [primary] : [primary, fallback];
}

export const solanaRpcFetch: FetchFn = async (
	input: Parameters<FetchFn>[0],
	init?: Parameters<FetchFn>[1]
): Promise<Response> => {
	const endpoints = solanaRpcEndpoints();
	const primary = endpoints[0];
	const fallback = endpoints[1];
	const target = fetchInputUrl(input);

	if (fallback === undefined || target !== primary) {
		return fetch(input, init);
	}

	try {
		const response = await fetch(input, init);
		if (shouldFallback(response) || (await hasRetryableRpcError(response))) {
			return await fetch(fallback, init);
		}
		return response;
	} catch {
		return fetch(fallback, init);
	}
};

export function solanaConnectionConfig(): ConnectionConfig {
	return {
		commitment: "confirmed",
		disableRetryOnRateLimit: true,
		fetch: solanaRpcFetch,
	};
}

export function createSolanaConnection(
	rpcEndpoint = primarySolanaRpcUrl()
): Connection {
	return new Connection(rpcEndpoint, solanaConnectionConfig());
}
