import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { resolvePrimaryHandle } from "@src/common/server-profile";

export const dynamic = "force-dynamic";

type PageProperties = {
	params: Promise<{ wallet: string }>;
};

// The wallet URL is a stable but non-canonical entry point: it always redirects
// to the wallet's primary @handle, so it should not be indexed on its own.
export const metadata: Metadata = {
	robots: { index: false, follow: true },
};

/**
 * /u/{wallet} resolves a wallet address to its canonical primary @handle and
 * temporarily redirects there. This keeps a durable, handle-independent URL for
 * a wallet while the indexed canonical remains /@handle.
 */
export default async function WalletProfilePage({
	params,
}: PageProperties): Promise<React.ReactElement> {
	const { wallet } = await params;
	const handle = await resolvePrimaryHandle(decodeURIComponent(wallet));
	if (!handle) {
		notFound();
	}
	redirect(`/${encodeURIComponent(handle)}`);
}
