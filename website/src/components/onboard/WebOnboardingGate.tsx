"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
	TinyPlaceError,
	type TinyPlaceClient,
	type User,
} from "@tinyhumansai/tinyplace";

import { useApiClient } from "@src/common/api-context";
import { queryKeys } from "@src/common/query-keys";
import { useAuthStore } from "@src/store/auth";

const EXCLUDED_PREFIXES = [
	"/auth",
	"/fund",
	"/identities",
	"/onboard",
	"/profile",
] as const;

function isExcludedPath(pathname: string): boolean {
	return EXCLUDED_PREFIXES.some(
		(prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
	);
}

// Onboarding is only forced for the essentials: a verified email and a profile
// display name. Claiming a @handle (an active identity) is optional, so a missing
// username alone must NOT trigger the redirect — the handle step stays available
// inside the wizard and on /identities for anyone who wants it.
function setupIncomplete(user: User | null | undefined): boolean {
	const verified = Boolean(user?.emailVerified);
	const profiled = Boolean(user?.displayName?.trim());
	return !verified || !profiled;
}

async function getOptionalUser(
	client: TinyPlaceClient,
	agentId: string
): Promise<User | null> {
	try {
		return await client.users.get(agentId);
	} catch (caught) {
		if (caught instanceof TinyPlaceError && caught.status === 404) {
			return null;
		}
		throw caught;
	}
}

export function WebOnboardingGate(): null {
	const agentId = useAuthStore((state) => state.agentId);
	const signer = useAuthStore((state) => state.signer);
	const client = useApiClient();
	const pathname = usePathname();
	const router = useRouter();
	const searchParameters = useSearchParams();
	const excluded = isExcludedPath(pathname);

	const userQuery = useQuery({
		queryKey: queryKeys.users.detail(agentId ?? ""),
		queryFn: (): Promise<User | null> =>
			getOptionalUser(client, agentId as string),
		enabled: Boolean(agentId && signer && !excluded),
		retry: false,
	});

	useEffect(() => {
		if (!agentId || !signer || excluded) {
			return;
		}
		// The Playwright e2e bridge establishes a programmatic session without the
		// email/profile onboarding a real user completes. Its flag suppresses the
		// onboarding redirect so e2e can exercise gated pages (e.g. /bounties).
		// Inert for real users (the flag is only ever set by the e2e harness).
		if (
			typeof window !== "undefined" &&
			window.localStorage.getItem("tinyplace:e2e") === "1"
		) {
			return;
		}
		if (userQuery.isLoading) {
			return;
		}
		if (userQuery.isError) {
			return;
		}
		if (!setupIncomplete(userQuery.data)) {
			return;
		}
		const current = `${pathname}${searchParameters.toString() ? `?${searchParameters.toString()}` : ""}`;
		const next = new URLSearchParams({ returnTo: current });
		router.replace(`/onboard/web?${next.toString()}`);
	}, [
		agentId,
		excluded,
		pathname,
		router,
		searchParameters,
		signer,
		userQuery.data,
		userQuery.isError,
		userQuery.isLoading,
	]);

	return null;
}
