import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProfileTabs } from "@src/components/profile/ProfileTabs";
import { userToProfile } from "@src/components/profile/profile-adapter";
import {
	fetchIdentitiesByCryptoId,
	fetchUserByCryptoId,
	primaryHandleFromIdentities,
} from "@src/common/server-profile";

export const dynamic = "force-dynamic";

type PageProperties = {
	params: Promise<{ wallet: string }>;
};

// Wallet profile URLs are durable identity URLs but are not canonical SEO pages
// when a primary @handle exists.
export const metadata: Metadata = {
	robots: { index: false, follow: true },
};

export default async function WalletProfilePage({
	params,
}: PageProperties): Promise<React.ReactElement> {
	const { wallet } = await params;
	const cryptoId = decodeURIComponent(wallet);
	const [user, identities] = await Promise.all([
		fetchUserByCryptoId(cryptoId),
		fetchIdentitiesByCryptoId(cryptoId),
	]);

	if (!user) {
		notFound();
	}

	const handle = primaryHandleFromIdentities(identities);
	return (
		<ProfileTabs
			profile={userToProfile(user, handle ?? undefined, identities)}
		/>
	);
}
