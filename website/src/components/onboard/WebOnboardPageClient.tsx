"use client";

import { useQuery } from "@tanstack/react-query";
import {
	TinyPlaceError,
	type Identity,
	type TinyPlaceClient,
	type User,
} from "@tinyhumansai/tinyplace";
import type { ReactNode } from "react";

import { useApiClient } from "@src/common/api-context";
import { queryKeys } from "@src/common/query-keys";
import type { FunctionComponent } from "@src/common/types";
import { useTinyplaceWallet } from "@src/common/tinyplace-wallet";
import { useAuthStore } from "@src/store/auth";

import { WebOnboardWizard } from "./OnboardWizard";

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

function Message({ children }: { children: ReactNode }): FunctionComponent {
	return (
		<main className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-4 px-4 py-10">
			{children}
		</main>
	);
}

export function WebOnboardPageClient(): FunctionComponent {
	const agentId = useAuthStore((state) => state.agentId);
	const signer = useAuthStore((state) => state.signer);
	const client = useApiClient();
	const wallet = useTinyplaceWallet();
	const userQuery = useQuery({
		queryKey: queryKeys.users.detail(agentId ?? ""),
		queryFn: (): Promise<User | null> =>
			getOptionalUser(client, agentId as string),
		enabled: Boolean(agentId && signer),
		retry: false,
	});
	const identitiesQuery = useQuery({
		queryKey: ["gql", "identities", agentId] as const,
		queryFn: (): Promise<Array<Identity>> =>
			client.graphql.identities(agentId as string),
		enabled: Boolean(agentId && signer),
		retry: false,
	});

	if (!agentId || !signer) {
		return (
			<Message>
				<h1 className="text-xl font-semibold text-front">
					Connect your wallet
				</h1>
				<p className="text-sm text-muted">
					Sign in with your wallet to finish setting up your account.
				</p>
				<button
					className="w-fit rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-front hover:bg-primary-hover"
					type="button"
					onClick={wallet.openConnectModal}
				>
					Connect
				</button>
			</Message>
		);
	}

	if (userQuery.isLoading || identitiesQuery.isLoading) {
		return (
			<Message>
				<h1 className="text-xl font-semibold text-front">Checking setup…</h1>
				<p className="text-sm text-muted">
					Loading your profile, verification, and handle status.
				</p>
			</Message>
		);
	}

	if (userQuery.isError || identitiesQuery.isError) {
		return (
			<Message>
				<h1 className="text-xl font-semibold text-front">
					Could not check setup
				</h1>
				<p className="text-sm text-danger">
					{userQuery.error?.message ??
						identitiesQuery.error?.message ??
						"Unknown setup error."}
				</p>
			</Message>
		);
	}

	return (
		<WebOnboardWizard
			activeIdentities={identitiesQuery.data}
			client={client}
			user={userQuery.data}
			wallet={agentId}
		/>
	);
}
