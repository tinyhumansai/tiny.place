"use client";

import dynamic from "next/dynamic";

import type { FunctionComponent } from "@src/common/types";

const WalletMultiButton = dynamic(
	() =>
		import("@solana/wallet-adapter-react-ui").then(
			(m) => m.WalletMultiButton,
		),
	{ ssr: false },
);

export const ConnectWalletButton = (): FunctionComponent => {
	return <WalletMultiButton />;
};
