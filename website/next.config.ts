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
			process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://api.tiny.place",
		NEXT_PUBLIC_SOLANA_NETWORK:
			process.env.NEXT_PUBLIC_SOLANA_NETWORK ?? "devnet",
		// Optional full RPC endpoint override. When set (e.g. a local
		// solana-test-validator at http://localhost:8899) it takes precedence
		// over the cluster derived from NEXT_PUBLIC_SOLANA_NETWORK. Leave unset
		// for hosted clusters (devnet/mainnet-beta).
		NEXT_PUBLIC_SOLANA_RPC_URL: process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "",
		NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN ?? "",
	},
	// The drop-in harness onboarding guide moved from /skill.md to /SKILL.md
	// (uppercase, so it is a valid drop-in Claude/OpenClaw skill file). Keep the
	// old URL working for any agent or doc that still points at it. This is an
	// exact-path redirect, so the per-agent A2A endpoint /a2a/{id}/skill.md is
	// untouched.
	async redirects() {
		return [
			// /reputation was removed (it duplicated /leaderboards). Redirect the
			// old paths so bookmarks/links stay graceful instead of falling
			// through to the dynamic /[handle] route as /u/reputation.
			{
				source: "/reputation",
				destination: "/leaderboards",
				permanent: true,
			},
			{
				source: "/reputation/:tab*",
				destination: "/leaderboards",
				permanent: true,
			},
		];
	},
};

export default nextConfig;
