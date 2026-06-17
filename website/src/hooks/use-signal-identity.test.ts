import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SignalIdentity } from "@src/common/signal-identity";
import { useAuthStore } from "@src/store/auth";
import { useConversationsStore } from "@src/store/conversations";
import { useMessagingStore } from "@src/store/messaging";
import { useSignalStore } from "@src/store/signal";

import { useSignalIdentity } from "./use-signal-identity";

const mocks = vi.hoisted(() => ({
	signMessage: vi.fn(),
	loadOrCreateSignalIdentity: vi.fn(),
	publishKeyBundle: vi.fn(),
	verifyKeyBundlePublished: vi.fn(),
	publishEncryptionKey: vi.fn(),
}));

vi.mock("@solana/wallet-adapter-react", () => ({
	useWallet: (): unknown => ({
		connected: true,
		signMessage: mocks.signMessage,
	}),
}));

vi.mock("@src/common/api-context", () => ({
	useApiClient: (): unknown => ({}),
}));

vi.mock("@src/common/signal-identity", () => ({
	loadOrCreateSignalIdentity: mocks.loadOrCreateSignalIdentity,
	// The auto-restore effect calls hasSignalIdentity(); default it to false so
	// these tests exercise the explicit enable() path deterministically.
	hasSignalIdentity: (): boolean => false,
}));

vi.mock("@src/common/signal-messaging", () => ({
	createEncryptionClient: (): unknown => ({ keys: { getBundle: vi.fn() } }),
	createSession: (): unknown => ({}),
	publishKeyBundle: mocks.publishKeyBundle,
	verifyKeyBundlePublished: mocks.verifyKeyBundlePublished,
}));

vi.mock("@src/common/encryption-discovery", () => ({
	publishEncryptionKey: mocks.publishEncryptionKey,
}));

const ADDRESS = "addr-1";
const identity = {
	signer: { publicKeyBase64: ADDRESS },
	store: {},
} as unknown as SignalIdentity;

describe("useSignalIdentity enable()", () => {
	beforeEach(() => {
		useSignalStore.getState().reset();
		useMessagingStore.getState().reset();
		useConversationsStore.getState().reset();
		useAuthStore.setState({ agentId: "wallet-agent" });

		mocks.loadOrCreateSignalIdentity.mockResolvedValue(identity);
		mocks.publishKeyBundle.mockResolvedValue(undefined);
		mocks.verifyKeyBundlePublished.mockResolvedValue(undefined);
		mocks.publishEncryptionKey.mockResolvedValue(undefined);
		vi.spyOn(console, "error").mockImplementation((): void => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("reports ready and probes the relay once the bundle is verified", async () => {
		const { result } = renderHook(() => useSignalIdentity());

		let returned: SignalIdentity | undefined;
		await act(async (): Promise<void> => {
			returned = await result.current.enable();
		});

		expect(returned).toBe(identity);
		// Success means the bundle was actually verified on the relay post-enable.
		expect(mocks.verifyKeyBundlePublished).toHaveBeenCalledWith(
			expect.anything(),
			ADDRESS
		);
		expect(result.current.isReady).toBe(true);
		expect(result.current.error).toBeUndefined();
		expect(useMessagingStore.getState().bundleVerified).toBe(true);
	});

	it("propagates a publish failure into error state instead of silent success", async () => {
		mocks.publishKeyBundle.mockRejectedValue(
			new Error("MyTonWallet cannot sign prekeys")
		);

		const { result } = renderHook(() => useSignalIdentity());

		let returned: SignalIdentity | undefined;
		await act(async (): Promise<void> => {
			returned = await result.current.enable();
		});

		// Must NOT report a usable identity when the bundle never published.
		expect(returned).toBeUndefined();
		expect(result.current.isReady).toBe(false);
		expect(result.current.status).toBe("error");
		expect(result.current.error).toContain("Messaging not reachable");
		expect(result.current.error).toContain("MyTonWallet cannot sign prekeys");
		expect(useMessagingStore.getState().bundleVerified).toBe(false);
	});

	it("fails when publish succeeds but the verification probe finds no bundle", async () => {
		mocks.verifyKeyBundlePublished.mockRejectedValue(
			new Error("Key bundle for addr-1 did not land on the relay")
		);

		const { result } = renderHook(() => useSignalIdentity());

		let returned: SignalIdentity | undefined;
		await act(async (): Promise<void> => {
			returned = await result.current.enable();
		});

		expect(returned).toBeUndefined();
		expect(result.current.isReady).toBe(false);
		expect(result.current.status).toBe("error");
		expect(result.current.error).toContain("did not land on the relay");
		expect(useMessagingStore.getState().bundleVerified).toBe(false);
		// Publish/advertise progress is cleared so a retry re-publishes instead of
		// skipping straight to a verification that would keep failing.
		expect(useMessagingStore.getState().bundlePublished).toBe(false);
		expect(useMessagingStore.getState().keyAdvertised).toBe(false);
	});
});
