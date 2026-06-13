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
	},
};

export default nextConfig;
