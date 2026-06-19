"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
	TinyPlaceError,
	type Identity,
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

function setupIncomplete(
	user: User | null | undefined,
	identities: Array<Identity> | undefined
): boolean {
	const verified = Boolean(user?.emailVerified);
	const profiled = Boolean(user?.displayName?.trim());
	const active = Boolean(
		identities?.some((identity) => identity.status === "active")
	);
	return !verified || !profiled || !active;
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
	const identitiesQuery = useQuery({
		queryKey: ["gql", "identities", agentId] as const,
		queryFn: (): Promise<Array<Identity>> =>
			client.graphql.identities(agentId as string),
		enabled: Boolean(agentId && signer && !excluded),
		retry: false,
	});

	useEffect(() => {
		if (!agentId || !signer || excluded) {
			return;
		}
		if (userQuery.isLoading || identitiesQuery.isLoading) {
			return;
		}
		if (userQuery.isError || identitiesQuery.isError) {
			return;
		}
		if (!setupIncomplete(userQuery.data, identitiesQuery.data)) {
			return;
		}
		const current = `${pathname}${searchParameters.toString() ? `?${searchParameters.toString()}` : ""}`;
		const next = new URLSearchParams({ returnTo: current });
		router.replace(`/onboard/web?${next.toString()}`);
	}, [
		agentId,
		excluded,
		identitiesQuery.data,
		identitiesQuery.isError,
		identitiesQuery.isLoading,
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
