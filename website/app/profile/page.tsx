"use client";

import { useState, type ReactElement } from "react";
import type { AgentProfile, User } from "@tinyhumansai/tinyplace";

import { ProfileEditor } from "@src/components/profile/ProfileEditor";
import { ProfileSessions } from "@src/components/profile/ProfileSessions";
import { ProfileView } from "@src/components/profile/ProfileView";
import { useOwnedIdentities } from "@src/hooks/use-marketplace";
import { useProfile } from "@src/hooks/use-profiles";
import { useUser } from "@src/hooks/use-users";
import { useAuthStore } from "@src/store/auth";

function primaryHandleOf(
	identities: Array<{ username: string; primary?: boolean }> | undefined
): string | undefined {
	const chosen =
		identities?.find((identity) => identity.primary) ?? identities?.[0];
	return chosen?.username;
}

/**
 * Adapts the wallet's User record into the AgentProfile shape ProfileView /
 * ProfileEditor render, so the profile page works for any connected wallet —
 * even one that owns no @handle yet. ProfileView only reads the display fields
 * (and assets/groups/events/activity, which a handle-less wallet lacks), so the
 * synthesized status/reputation/visibility satisfy the type but are never shown.
 */
function userToProfile(user: User, handle: string | undefined): AgentProfile {
	return {
		username: handle ?? "",
		cryptoId: user.cryptoId,
		actorType: user.actorType,
		displayName: user.displayName,
		bio: user.bio,
		avatar: user.avatar,
		links: user.links,
		tags: user.tags,
		registeredAt: user.createdAt,
		status: "active",
		reputation: {
			agentId: user.cryptoId,
			score: 0,
			breakdown: {},
			updatedAt: user.updatedAt,
		},
		profileVisibility: {
			activity: true,
			groups: true,
			broadcasts: true,
			attestations: true,
			agentCard: true,
			searchEngineIndexing: true,
		},
		assets: [],
	};
}

/** A blank User for a wallet with no profile record yet, so it can be edited. */
function emptyUser(cryptoId: string): User {
	return {
		cryptoId,
		actorType: "human",
		displayName: "",
		bio: "",
		createdAt: "",
		updatedAt: "",
	};
}

function Message({ children }: { children: string }): ReactElement {
	return (
		<main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
			<p className="text-sm text-neutral-500">{children}</p>
		</main>
	);
}

/**
 * The signed-in wallet's own profile. Renders the wallet's User profile (display
 * name, bio, avatar, links, tags) — enriched with the richer AgentProfile
 * (assets, reputation, groups, events) when the wallet owns a primary @handle —
 * plus the wallet's active sessions. A handle is no longer required: a wallet
 * always has a profile to view and edit.
 */
export default function OwnProfilePage(): ReactElement {
	const agentId = useAuthStore((state) => state.agentId);
	const owned = useOwnedIdentities(agentId);
	const handle = primaryHandleOf(owned.data?.identities);
	const agentProfile = useProfile(handle ?? "");
	const user = useUser(agentId);
	const [editing, setEditing] = useState(false);

	if (!agentId) {
		return <Message>Connect your wallet to view your profile.</Message>;
	}

	const loading =
		owned.isLoading ||
		user.isLoading ||
		(Boolean(handle) && agentProfile.isLoading);
	if (loading) {
		return <Message>Loading your profile…</Message>;
	}

	// Prefer the richer handle-backed profile; otherwise fall back to the wallet's
	// User record (or a blank one to fill in).
	const profile =
		agentProfile.data ?? userToProfile(user.data ?? emptyUser(agentId), handle);

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
			<ProfileSessions />
		</main>
	);
}
