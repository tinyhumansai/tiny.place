/**
 * Support helpers for the live identity e2e suite (identity-workflows.spec.ts).
 *
 * These tests run against the REAL local stack (docker frontend on :3003 →
 * backend :8083 → local validator), so they only run when E2E_LIVE=1 and the
 * provisioned facilitator/mint are present. Node-side helpers register handles
 * and seed listings via the SDK (custodial settlement) so each browser test can
 * focus on the button under test; the browser signs in through the session-mode
 * E2E auth bridge.
 */
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";

import {
	buildX402PaymentMap,
	LocalSigner,
	SOLANA_MAINNET_NETWORK,
	TinyPlaceClient,
	TinyPlaceError,
} from "@tinyhumansai/tinyplace";
import type { Page } from "@playwright/test";

export const API_URL = process.env.E2E_API_URL ?? "http://localhost:8083";

/**
 * Flushes the backend's Redis response cache so the browser's next GETs (e.g.
 * the 30s-cached /marketplace/identities listing) reflect just-seeded data
 * instead of a stale page. Best-effort; the redis container is overridable.
 */
export function flushCache(): void {
	const container = process.env.E2E_REDIS_CONTAINER ?? "tp-e2e-redis-1";
	try {
		execSync(`docker exec ${container} redis-cli flushall`, { stdio: "ignore" });
	} catch {
		/* best effort — cache flush is an optimization, not required */
	}
}

/** A fresh 32-byte seed (hex) — shared between Node setup and the browser. */
export function freshSeed(): string {
	return randomBytes(32).toString("hex");
}

function hexToBytes(hex: string): Uint8Array {
	const bytes = new Uint8Array(hex.length / 2);
	for (let index = 0; index < bytes.length; index += 1) {
		bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
	}
	return bytes;
}

const uniq = (): string => randomBytes(3).toString("hex");

function challengeOf(error: unknown): Record<string, string> | undefined {
	if (error instanceof TinyPlaceError && error.status === 402) {
		const body = error.body as { payment?: Record<string, string> } | undefined;
		return error.paymentRequired?.payment ?? body?.payment;
	}
	return undefined;
}

async function custodialPayment(
	signer: LocalSigner,
	challenge: Record<string, string>,
	fromCryptoId: string,
	publicKeyBase64: string,
	metadata: Record<string, string>
): Promise<Record<string, string>> {
	return buildX402PaymentMap(signer, {
		scheme: challenge.scheme as never,
		network: challenge.network,
		asset: challenge.asset,
		amount: challenge.amount,
		from: challenge.from || fromCryptoId,
		to: challenge.to,
		nonce: challenge.nonce || `e2e-${uniq()}`,
		expiresAt: challenge.expiresAt,
		expiresInMs: 5 * 60 * 1000,
		publicKeyBase64,
		metadata: { ...challenge.metadata, ...metadata },
	});
}

export async function walletFromSeed(seedHex: string): Promise<LocalSigner> {
	return LocalSigner.fromSeed(hexToBytes(seedHex));
}

const price = (
	amount: string
): { amount: string; asset: string; network: string } => ({
	amount,
	asset: "USDC",
	network: SOLANA_MAINNET_NETWORK,
});

/** Registers `name` for the seed wallet via custodial settlement. */
export async function registerHandle(
	seedHex: string,
	name: string,
	primary: boolean
): Promise<LocalSigner> {
	const wallet = await walletFromSeed(seedHex);
	const client = new TinyPlaceClient({ baseUrl: API_URL, signer: wallet });
	const request = {
		username: name,
		cryptoId: wallet.agentId,
		publicKey: wallet.publicKeyBase64,
		primary,
	};
	let challenge: Record<string, string> | undefined;
	try {
		await client.registry.register(request);
	} catch (error) {
		challenge = challengeOf(error);
		if (!challenge) throw error;
	}
	if (!challenge) throw new Error(`no 402 challenge registering @${name}`);
	const payment = await custodialPayment(
		wallet,
		challenge,
		wallet.agentId,
		wallet.publicKeyBase64,
		{ identity: name, purpose: "registration", publicKey: wallet.publicKeyBase64 }
	);
	await client.registry.register({ ...request, payment });
	return wallet;
}

/**
 * Seeds a fixed-price (or auction) listing from a throwaway seller and returns
 * the seller wallet + listingId + handle. The seller is distinct from any test
 * buyer.
 */
export async function seedListing(
	listingType: "fixed" | "auction"
): Promise<{ handle: string; listingId: string }> {
	const seed = freshSeed();
	const seller = await walletFromSeed(seed);
	const client = new TinyPlaceClient({ baseUrl: API_URL, signer: seller });
	await registerHandle(seed, `shop${uniq()}`, true);
	const handle = `${listingType === "auction" ? "auc" : "buy"}${uniq()}`;
	await registerHandle(seed, handle, false);
	const listing = await client.marketplace.createIdentityListing({
		name: `@${handle}`,
		seller: `@${handle}`,
		sellerCryptoId: seller.agentId,
		type: "identity",
		category: "identity",
		listingType,
		price: price("100000"),
		...(listingType === "auction"
			? {
					reservePrice: price("100000"),
					expiresAt: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
				}
			: {}),
		status: "active",
	});
	return { handle: `@${handle}`, listingId: listing.listingId };
}

/**
 * Signs the browser in as the seed wallet using the session-mode E2E bridge,
 * then loads the identities page. Must run before any app navigation.
 */
export async function signInSession(
	page: Page,
	seedHex: string
): Promise<void> {
	// Clear the server cache so the browser's GETs reflect this test's just-seeded
	// listings/registrations rather than a prior test's cached page.
	flushCache();
	await page.addInitScript(() => {
		window.localStorage.setItem("tinyplace:e2e", "1");
	});
	await page.goto("/identities");
	await page.waitForFunction(
		() =>
			Boolean(
				(window as unknown as { __tinyplaceE2E?: unknown }).__tinyplaceE2E
			),
		undefined,
		{ timeout: 15_000 }
	);
	await page.evaluate(
		async (seed) => {
			await (
				window as unknown as {
					__tinyplaceE2E: {
						signIn: (
							seedHex: string,
							options?: { session?: boolean }
						) => Promise<{ agentId: string }>;
					};
				}
			).__tinyplaceE2E.signIn(seed, { session: true });
		},
		seedHex
	);
}

/** Clicks a tab chip in the identities shell. */
export async function openTab(
	page: Page,
	label: "Register" | "Registry" | "Trading"
): Promise<void> {
	await page.getByRole("button", { name: label, exact: true }).click();
}
