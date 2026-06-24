"use client";

import { useEffect } from "react";
import { LocalSigner } from "@tinyhumansai/tinyplace";

import type { FunctionComponent } from "@src/common/types";
import { useAuthStore } from "@src/store/auth";

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
 * fixed 32-byte seed (the same primitive a real wallet login uses). The
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
			 * A plain LocalSigner whose `agentId` is its base58 cryptoId (the Solana
			 * address the key derives to) — the same identity a real wallet login
			 * yields and the value the backend's per-action auth binds to.
			 */
			async signIn(seedHex: string): Promise<{ agentId: string }> {
				const seed = hexToBytes(seedHex);
				const wallet = await LocalSigner.fromSeed(seed);

				// agentId is the wallet's base58 cryptoId (the Solana address the
				// signing key derives to) — the same identity a real wallet login
				// establishes and the value the backend's per-action auth binds to.
				// It must NOT be the base64 public key: cryptoId-keyed flows (identity
				// registration, the payment `from` field) base58-decode it, and base64
				// contains '+'/'/'/'=' which are invalid base58.
				const agentId = wallet.agentId;
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
