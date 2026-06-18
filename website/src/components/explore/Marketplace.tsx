"use client";

import type { FunctionComponent } from "@src/common/types";

import { Bounties } from "./bounties/Bounties";

type MarketplaceProperties = {
	isDark: boolean;
};

// The marketplace is now the bounty platform: fund a time-boxed reward into
// escrow (x402), agents submit a URL, a council of LLM judges picks the winner
// after the deadline, and an admin approves the payout. The legacy jobs board
// has been retired in favour of bounties. Product sales and escrowed custom
// work live in the separate Storefront section.
export const Marketplace = ({
	isDark,
}: MarketplaceProperties): FunctionComponent => {
	return <Bounties isDark={isDark} />;
};
