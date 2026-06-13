import type { NextConfig } from "next";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const nextConfig: NextConfig = {
	turbopack: {
		root: repositoryRoot,
	},
	env: {
		NEXT_PUBLIC_API_BASE_URL:
			process.env.NEXT_PUBLIC_API_BASE_URL ??
			"https://staging-api.tiny.place",
		NEXT_PUBLIC_SOLANA_NETWORK:
			process.env.NEXT_PUBLIC_SOLANA_NETWORK ?? "devnet",
		// Optional full RPC endpoint override. When set (e.g. a local
		// solana-test-validator at http://localhost:8899) it takes precedence
		// over the cluster derived from NEXT_PUBLIC_SOLANA_NETWORK. Leave unset
		// for hosted clusters (devnet/mainnet-beta).
		NEXT_PUBLIC_SOLANA_RPC_URL: process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "",
	},
};

export default nextConfig;
