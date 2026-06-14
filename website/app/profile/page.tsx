"use client";

import { useState, type ReactElement } from "react";

import { ProfileEditor } from "@src/components/profile/ProfileEditor";
import { ProfileView } from "@src/components/profile/ProfileView";
import { useOwnedIdentities } from "@src/hooks/use-marketplace";
import { useProfile } from "@src/hooks/use-profiles";
import { useAuthStore } from "@src/store/auth";

function primaryHandleOf(
	identities: Array<{ username: string; primary?: boolean }> | undefined
): string | undefined {
	const chosen =
		identities?.find((identity) => identity.primary) ?? identities?.[0];
	return chosen?.username;
}

function Message({ children }: { children: string }): ReactElement {
	return (
		<main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
			<p className="text-sm text-neutral-500">{children}</p>
		</main>
	);
}

/**
 * The signed-in wallet's own profile. Resolves the wallet's primary @handle,
 * renders the same public ProfileView, and adds an inline editor for the
 * wallet-level profile fields. Navigating to a specific @handle uses the public
 * /@handle route instead.
 */
export default function OwnProfilePage(): ReactElement {
	const agentId = useAuthStore((state) => state.agentId);
	const owned = useOwnedIdentities(agentId);
	const handle = primaryHandleOf(owned.data?.identities);
	const profileQuery = useProfile(handle ?? "");
	const [editing, setEditing] = useState(false);

	if (!agentId) {
		return <Message>Connect your wallet to view your profile.</Message>;
	}
	if (owned.isLoading || (handle && profileQuery.isLoading)) {
		return <Message>Loading your profile…</Message>;
	}
	if (!handle) {
		return (
			<Message>
				No handle yet — register an identity to claim your profile.
			</Message>
		);
	}
	if (profileQuery.isError || !profileQuery.data) {
		return <Message>Failed to load your profile.</Message>;
	}

	const profile = profileQuery.data;
	return (
		<main className="min-h-screen bg-neutral-50 px-4 py-10">
			{editing ? (
				<div className="mx-auto w-full max-w-3xl">
					<ProfileEditor
						profile={profile}
						onClose={(): void => setEditing(false)}
					/>
				</div>
			) : (
				<ProfileView
					actions={
						<button
							className="shrink-0 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
							type="button"
							onClick={(): void => setEditing(true)}
						>
							Edit
						</button>
					}
					profile={profile}
				/>
			)}
		</main>
	);
}
