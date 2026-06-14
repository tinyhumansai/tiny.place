"use client";

import { useEffect } from "react";
import {
	BrowserSessionSigner,
	LocalSigner,
	Signer,
	SOLANA_MAINNET_NETWORK,
	type X25519KeyPair,
} from "@tinyhumansai/tinyplace";

import { createClient } from "@src/common/api-client";
import type { FunctionComponent } from "@src/common/types";
import { useAuthStore } from "@src/store/auth";

// Test-only signer that acts as the wallet but signs with an approved hot-session
// key — mirroring the production SessionWalletSigner just enough to drive x402
// payment flows (it carries the session key + grant nonce as x402 metadata).
class BridgeSessionSigner extends Signer {
	public readonly agentId: string;
	public readonly publicKeyBase64: string;
	private readonly session: BrowserSessionSigner;

	public constructor(agentId: string, session: BrowserSessionSigner) {
		super();
		this.agentId = agentId;
		this.publicKeyBase64 = session.publicKeyBase64;
		this.session = session;
	}

	public sign(data: Uint8Array): Promise<Uint8Array> {
		return this.session.sign(data);
	}

	public getX25519KeyPair(): Promise<X25519KeyPair> {
		return this.session.getX25519KeyPair();
	}

	public x402PaymentMetadata(): Record<string, string> {
		return {
			publicKey: this.publicKeyBase64,
			parentNonce: this.session.getApprovalNonce() ?? "",
		};
	}
}

function hexToBytes(hex: string): Uint8Array {
	const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
	if (clean.length % 2 !== 0) {
		throw new Error("hex seed must have an even length");
	}
	const bytes = new Uint8Array(clean.length / 2);
	for (let index = 0; index < bytes.length; index += 1) {
		bytes[index] = Number.parseInt(clean.slice(index * 2, index * 2 + 2), 16);
	}
	return bytes;
}

/**
 * A test-only bridge that lets the Playwright e2e suite establish an
 * authenticated session without driving the real Solana wallet adapter (which
 * needs a browser extension / Phantom and cannot run headless).
 *
 * It is inert unless `localStorage["tinyplace:e2e"] === "1"` — a flag only the
 * e2e harness sets (via `page.addInitScript`), never a real user. When active it
 * exposes `window.__tinyplaceE2E.signIn(seedHex)` / `signOut()`, which seed the
 * in-memory auth store with a deterministic {@link LocalSigner} derived from a
 * fixed 32-byte seed (the same primitive a real hot-session login uses). The
 * injected signer only ever authorizes the seed the caller already supplies, so
 * it grants no capability a user could not grant themselves through the normal
 * connect flow.
 */
export const E2EAuthBridge = (): FunctionComponent => {
	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}
		if (window.localStorage.getItem("tinyplace:e2e") !== "1") {
			return;
		}

		const bridge = {
			/**
			 * Seeds an authenticated session from a 32-byte hex seed and returns the
			 * resulting agent id.
			 *
			 * Default (lottery) mode: a plain LocalSigner whose `agentId` is its
			 * base64 public key — the writer id the lottery authorizes by.
			 *
			 * `{ session: true }` (identity mode): approves a real hot-session
			 * delegate of the seed wallet and signs in as that session, with
			 * `agentId` set to the wallet's cryptoId (Solana address). This is the
			 * path required to exercise x402 payment flows (buy/bid/offer/renew),
			 * which need the session key bound as the payer. The wallet itself is
			 * kept as the identity signer for registration (identity-binding) ops.
			 */
			async signIn(
				seedHex: string,
				options?: { session?: boolean }
			): Promise<{ agentId: string }> {
				const seed = hexToBytes(seedHex);
				const wallet = await LocalSigner.fromSeed(seed);

				if (options?.session) {
					const session = await BrowserSessionSigner.create();
					const approval = await session.buildApprovalRequest(
						wallet,
						wallet.agentId,
						{
							network: SOLANA_MAINNET_NETWORK,
							asset: "SOL",
							budget: "1000000000",
							expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
							grantorPublicKey: wallet.publicKeyBase64,
						}
					);
					await createClient().signers.approve(approval.authorization);
					const sessionSigner = new BridgeSessionSigner(wallet.agentId, session);
					useAuthStore
						.getState()
						.setSigner(sessionSigner, wallet.agentId, wallet);
					return { agentId: wallet.agentId };
				}

				const agentId = wallet.publicKeyBase64;
				useAuthStore.getState().setSigner(wallet, agentId);
				return { agentId };
			},
			signOut(): void {
				useAuthStore.getState().clearSession();
			},
		};

		(window as unknown as { __tinyplaceE2E?: typeof bridge }).__tinyplaceE2E =
			bridge;
		window.dispatchEvent(new Event("tinyplace:e2e-ready"));
	}, []);

	return null;
};
