import type { Identity, TinyPlaceError } from "@tinyhumansai/tinyplace";

import { formatTokenAmount } from "@src/common/format-amount";

// Native SOL on the Solana mainnet caip-2 chain id; matches the value the rest
// of the explore UI uses for marketplace + escrow flows.
export const SOLANA_NETWORK = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";

export function inputClass(isDark: boolean): string {
	return `w-full rounded-md border px-2.5 py-1.5 text-xs ${
		isDark
			? "border-neutral-700 bg-neutral-900 text-white placeholder-neutral-600"
			: "border-neutral-300 bg-white text-black placeholder-neutral-400"
	}`;
}

export function selectClass(isDark: boolean): string {
	return `w-full rounded-md border px-2.5 py-1.5 text-xs ${
		isDark
			? "border-neutral-700 bg-neutral-900 text-white"
			: "border-neutral-300 bg-white text-black"
	}`;
}

export function labelClass(isDark: boolean): string {
	return `text-xs font-medium ${isDark ? "text-neutral-400" : "text-neutral-500"}`;
}

export function cardClass(isDark: boolean): string {
	return `rounded-lg border p-3 ${
		isDark
			? "border-neutral-800 bg-neutral-950"
			: "border-neutral-200 bg-neutral-50"
	}`;
}

export function mutedClass(isDark: boolean): string {
	return isDark ? "text-neutral-500" : "text-neutral-500";
}

export function strongClass(isDark: boolean): string {
	return isDark ? "text-white" : "text-black";
}

export function primaryButtonClass(): string {
	return "rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50";
}

export function secondaryButtonClass(isDark: boolean): string {
	return `rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
		isDark
			? "border-neutral-700 text-neutral-300 hover:border-neutral-500 hover:text-white"
			: "border-neutral-300 text-neutral-600 hover:border-neutral-400 hover:text-black"
	}`;
}

export function firstActiveIdentity(
	identities: Array<Identity> | undefined
): Identity | undefined {
	return identities?.find((identity) => identity.status === "active");
}

export function errorMessage(error: unknown, fallback: string): string {
	return error instanceof Error ? error.message : fallback;
}

export function paymentChallengeMessage(
	error: Error | null
): string | undefined {
	if (!error || error.name !== "TinyPlaceError") {
		return undefined;
	}
	const typed = error as TinyPlaceError;
	if (typed.status !== 402) {
		return undefined;
	}
	const body = typed.body as {
		error?: string;
		payment?: { amount?: string; asset?: string; network?: string };
	};
	const payment = body.payment;
	if (!payment) {
		return body.error ?? "Payment required";
	}
	// The challenge advertises the SPL mint in `asset` and the amount in base
	// units; format both back to a human "1 USDC" for the message.
	const formatted = payment.amount
		? formatTokenAmount(payment.amount, payment.asset)
		: (payment.asset ?? "");
	return `${body.error ?? "Payment required"}: ${formatted} on ${payment.network ?? ""}`.trim();
}

export function textToBase64(value: string): string {
	const bytes = new TextEncoder().encode(value);
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary);
}

export function slugify(value: string): string {
	const slug = value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return slug || "product";
}

export function formatDate(value: string | undefined): string {
	if (!value) {
		return "—";
	}
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return value;
	}
	return date.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}
