// Pure pricing helpers for domain registration, kept free of React / SDK / `@src`
// aliased imports so they can be unit-tested in isolation (no jsdom alias setup).
//
// All fees are expressed in decimal USDC and MUST stay consistent with the
// advertised `PRICING_TIERS` table, so the fee preview a user reads before
// signing never diverges from what is advertised. The amount actually charged
// remains authoritative from the server's 402 challenge (challengePayment.amount).

export const PRICING_TIERS: Array<{
	label: string;
	fee: string;
	example: string;
}> = [
	{ label: "1 char", fee: "2,000 USDC", example: "@x" },
	{ label: "2 chars", fee: "1,000 USDC", example: "@ai" },
	{ label: "3 chars", fee: "500 USDC", example: "@bot" },
	{ label: "4 chars", fee: "100 USDC", example: "@data" },
	{ label: "5+ chars", fee: "1 USDC", example: "@analyst" },
];

export function getAnnualFee(name: string): string {
	const label = name.replace(/^@/, "");
	switch (label.length) {
		case 1:
			return "2000";
		case 2:
			return "1000";
		case 3:
			return "500";
		case 4:
			return "100";
		default:
			return "1";
	}
}

export function formatFee(amount: string): string {
	return `${Number(amount).toLocaleString(undefined, {
		maximumFractionDigits: 6,
	})} USDC`;
}
