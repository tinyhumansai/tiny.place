import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
	TinyPlaceError,
	type Signer,
	type X402AuthorizationFields,
} from "@tinyhumansai/tinyplace";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useAuthStore } from "@src/store/auth";

import { DomainRegistration } from "./DomainRegistration";

type RegisterRequest = {
	actorType: "human";
	cryptoId: string;
	payment?: Record<string, string>;
	primary: boolean;
	publicKey: string;
	username: string;
};

type ConfirmRequest = {
	amount?: string;
	asset?: string;
	confirmLabel: string;
	note: string;
	recipient?: string;
	subject: string;
	title: string;
};

const register = vi.hoisted(() => vi.fn());
const createClient = vi.hoisted(() =>
	vi.fn((signer: Signer | undefined) => {
		void signer;
		return { registry: { register } };
	})
);
const confirmX402 = vi.hoisted(() => vi.fn());

vi.mock("@src/common/api-client", () => ({
	createClient: (signer?: Signer): unknown => createClient(signer),
}));

vi.mock("@src/hooks/use-registry", () => ({
	useHandleAvailability: (
		name: string
	): {
		data: { available: boolean; name: string } | undefined;
		isLoading: boolean;
	} => ({
		data: name ? { available: true, name } : undefined,
		isLoading: false,
	}),
}));

vi.mock("@src/hooks/use-marketplace", () => ({
	useOwnedIdentities: (): {
		data: { identities: Array<{ primary: boolean }> };
	} => ({
		data: { identities: [] },
	}),
}));

vi.mock("./x402-confirm", () => ({
	useOptionalX402Confirm: (): typeof confirmX402 => confirmX402,
}));

function renderRegistration(): void {
	const queryClient = new QueryClient({
		defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
	});
	render(
		<QueryClientProvider client={queryClient}>
			<DomainRegistration isDark={false} />
		</QueryClientProvider>
	);
}

function challenge(
	fields: Partial<X402AuthorizationFields> = {}
): TinyPlaceError {
	return new TinyPlaceError(402, {
		error: "x402 payment is required",
		payment: {
			scheme: "exact",
			network: "solana:devnet",
			asset: "SOL",
			amount: "1500000",
			to: "treasury-wallet",
			nonce: "registration-nonce",
			expiresAt: "2026-06-16T00:00:00.000Z",
			metadata: { serverTrace: "quote-1" },
			...fields,
		},
	});
}

function containsSensitiveKey(value: unknown): boolean {
	if (!value || typeof value !== "object") {
		return false;
	}
	for (const [key, child] of Object.entries(value)) {
		if (/private|secret/i.test(key)) {
			return true;
		}
		if (containsSensitiveKey(child)) {
			return true;
		}
	}
	return false;
}

function metadataRecord(
	metadata: Array<{ key: string; value: string }>
): Record<string, string> {
	return Object.fromEntries(metadata.map(({ key, value }) => [key, value]));
}

afterEach(() => {
	register.mockReset();
	createClient.mockClear();
	confirmX402.mockReset();
	useAuthStore.getState().clearSession();
});

describe("DomainRegistration x402 payment signing", () => {
	it("signs server challenges with the wallet identity and never submits private key material", async () => {
		const canonicalMessages: Array<string> = [];
		const wallet = {
			agentId: "wallet-agent",
			publicKeyBase64: "wallet-public-key",
			sign: (data: Uint8Array): Uint8Array => {
				canonicalMessages.push(new TextDecoder().decode(data));
				return new Uint8Array([1, 2, 3, 4]);
			},
		} as Signer;
		const user = userEvent.setup();

		useAuthStore.getState().setSigner(wallet, wallet.agentId);
		register.mockRejectedValueOnce(challenge()).mockResolvedValueOnce({
			username: "@atlas",
			cryptoId: "wallet-agent",
		});
		confirmX402.mockImplementation(
			async (
				request: ConfirmRequest,
				execute: () => Promise<Record<string, string>>
			): Promise<Record<string, string>> => {
				expect(request).toMatchObject({
					title: "Register identity",
					subject: "@atlas",
					amount: "1500000",
					asset: "SOL",
					recipient: "treasury-wallet",
					confirmLabel: "Sign x402",
				});
				return execute();
			}
		);

		renderRegistration();
		await user.type(
			screen.getByPlaceholderText("Search for a name..."),
			"atlas"
		);
		await user.click(screen.getByRole("button", { name: "Check" }));
		await user.click(
			screen.getByRole("button", { name: "Authorize 0.005 USDC & Register" })
		);

		await waitFor(() => {
			expect(register).toHaveBeenCalledTimes(2);
		});

		expect(createClient).toHaveBeenCalledWith(wallet);
		const unpaidRequest = register.mock.calls[0]?.[0] as RegisterRequest;
		expect(unpaidRequest).toMatchObject({
			username: "@atlas",
			cryptoId: "wallet-agent",
			publicKey: "wallet-public-key",
			primary: true,
			actorType: "human",
		});
		expect(unpaidRequest.payment).toBeUndefined();

		const paidRequest = register.mock.calls[1]?.[0] as RegisterRequest;
		expect(paidRequest.payment).toMatchObject({
			scheme: "exact",
			network: "solana:devnet",
			asset: "SOL",
			amount: "1500000",
			from: "wallet-agent",
			to: "treasury-wallet",
			nonce: "registration-nonce",
			expiresAt: "2026-06-16T00:00:00.000Z",
			signature: "AQIDBA==",
			"metadata.domain": "tiny.place",
			"metadata.identity": "@atlas",
			"metadata.publicKey": "wallet-public-key",
			"metadata.purpose": "registration",
			"metadata.serverTrace": "quote-1",
		});
		expect(containsSensitiveKey(paidRequest)).toBe(false);

		expect(canonicalMessages).toHaveLength(1);
		const canonical = JSON.parse(canonicalMessages[0]!) as {
			metadata: Array<{ key: string; value: string }>;
		};
		expect(canonical).toMatchObject({
			scheme: "exact",
			network: "solana:devnet",
			asset: "SOL",
			amount: "1500000",
			from: "wallet-agent",
			to: "treasury-wallet",
			nonce: "registration-nonce",
			expiresAt: "2026-06-16T00:00:00.000Z",
		});
		expect(metadataRecord(canonical.metadata)).toEqual({
			domain: "tiny.place",
			identity: "@atlas",
			publicKey: "wallet-public-key",
			purpose: "registration",
			serverTrace: "quote-1",
		});
	});
});
