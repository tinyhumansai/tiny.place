"use client";

import {
	AddressType,
	PhantomProvider,
	darkTheme,
	useDisconnect,
	useModal,
	usePhantom,
	useSolana,
} from "@phantom/react-sdk";
import { Connection, PublicKey, type Transaction } from "@solana/web3.js";
import type { Signer } from "@tinyhumansai/tinyplace";
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from "react";

import type { FunctionComponent } from "@src/common/types";
import {
	SiwsProofSigner,
	WalletSigner,
	setAuthSession,
} from "@src/common/auth-payment";
import { ensureBackendProfile } from "@src/common/ensure-profile";
import { setSessionInvalidHandler } from "@src/common/session-recovery";
import {
	primarySolanaRpcUrl,
	solanaConnectionConfig,
} from "@src/common/solana-rpc";
import { clearSiwsProof } from "@src/common/siws-auth";
import {
	ConnectionContext,
	WalletStateContext,
	type SignMessageFunction,
	type TinyplaceWalletState,
	useTinyplaceWallet,
} from "@src/common/tinyplace-wallet";
import type { WalletSignTransaction } from "@src/common/wallet-signer";
import { useAuthStore } from "@src/store/auth";
import { useAppStore } from "@src/store/app";

type PendingLoginSignature = {
	data: Uint8Array;
	message: string;
	reject: (error: unknown) => void;
	resolve: (signature: Uint8Array) => void;
};

const PHANTOM_APP_ID = "e1221f9a-0ce0-42c9-885c-3dc401153734";
const PHANTOM_APP_ICON =
	"https://phantom-portal20240925173430423400000001.s3.ca-central-1.amazonaws.com/icons/0f849962-bb31-41ba-a2d2-ad476edc70ce.png";

function phantomRedirectUrl(): string | undefined {
	if (typeof window === "undefined") {
		return undefined;
	}
	return `${window.location.origin}/auth/callback`;
}

function PhantomWalletBridge({
	children,
}: {
	children: ReactNode;
}): FunctionComponent {
	const { isConnected, isConnecting } = usePhantom();
	const { disconnect } = useDisconnect();
	const { open } = useModal();
	const { isAvailable, solana } = useSolana();
	const publicKey = useMemo(() => {
		if (!(isConnected && isAvailable && solana.publicKey)) {
			return null;
		}
		try {
			return new PublicKey(solana.publicKey);
		} catch {
			return null;
		}
	}, [isAvailable, isConnected, solana.publicKey]);
	const signMessage = useMemo<SignMessageFunction | undefined>(() => {
		if (!(isConnected && isAvailable && publicKey)) {
			return undefined;
		}
		return async (message): Promise<Uint8Array> => {
			const result = await solana.signMessage(message);
			return result.signature;
		};
	}, [isAvailable, isConnected, publicKey, solana]);
	const signTransaction = useMemo<WalletSignTransaction | undefined>(() => {
		if (!(isConnected && isAvailable && publicKey)) {
			return undefined;
		}
		return async (transaction: Transaction): Promise<Transaction> => {
			const signed = await solana.signTransaction(transaction);
			return signed as Transaction;
		};
	}, [isAvailable, isConnected, publicKey, solana]);
	const value = useMemo<TinyplaceWalletState>(
		() => ({
			connected: Boolean(isConnected && publicKey),
			connecting: isConnecting,
			disconnect,
			openConnectModal: open,
			publicKey,
			signMessage,
			signTransaction,
		}),
		[
			disconnect,
			isConnected,
			isConnecting,
			open,
			publicKey,
			signMessage,
			signTransaction,
		]
	);

	return (
		<WalletStateContext.Provider value={value}>
			{children}
		</WalletStateContext.Provider>
	);
}

function decodeSignatureMessage(data: Uint8Array): string {
	try {
		return new TextDecoder().decode(data);
	} catch {
		return "";
	}
}

function shorten(value: string): string {
	if (value.length <= 18) {
		return value;
	}
	return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function loginSignatureFields(message: string): Array<{
	label: string;
	value: string;
}> {
	try {
		const parsed = JSON.parse(message) as Record<string, unknown>;
		const metadata = Array.isArray(parsed["metadata"])
			? (parsed["metadata"] as Array<{ key?: unknown; value?: unknown }>)
			: [];
		const signerKey = metadata.find(
			(entry) => entry.key === "signerKey"
		)?.value;
		return [
			["Type", "Browser session approval"],
			["Scheme", parsed["scheme"]],
			["Network", parsed["network"]],
			["Asset", parsed["asset"]],
			["Budget", parsed["amount"]],
			["Wallet", parsed["from"]],
			["Expires", parsed["expiresAt"]],
			["Session key", signerKey],
		]
			.filter(([, value]) => typeof value === "string" && value.length > 0)
			.map(([label, value]) => ({
				label: label as string,
				value:
					label === "Session key"
						? shorten(value as string)
						: (value as string),
			}));
	} catch {
		return [{ label: "Message", value: message || "Sign-in request" }];
	}
}

function LoginSignatureDialog({
	error,
	isDark,
	onCancel,
	onConfirm,
	pending,
	signing,
}: {
	error: string | null;
	isDark: boolean;
	onCancel: () => void;
	onConfirm: () => void;
	pending: PendingLoginSignature;
	signing: boolean;
}): FunctionComponent {
	const panelClass = isDark
		? "border-neutral-800 bg-neutral-950 text-white"
		: "border-neutral-200 bg-white text-black";
	const mutedClass = isDark ? "text-neutral-400" : "text-neutral-500";
	const codeClass = isDark
		? "border-neutral-800 bg-neutral-900 text-neutral-300"
		: "border-neutral-200 bg-neutral-50 text-neutral-700";
	const fields = loginSignatureFields(pending.message);

	return (
		<div
			aria-modal="true"
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
			role="dialog"
		>
			<div
				className={`w-full max-w-md rounded-lg border p-5 shadow-xl ${panelClass}`}
			>
				<h3 className="text-sm font-semibold">Sign in to tiny.place</h3>
				<p className={`mt-1 text-xs ${mutedClass}`}>
					Your wallet will sign this reusable website auth proof.
				</p>

				<dl className="theme-detail-list mt-4 rounded-lg border">
					{fields.map((field) => (
						<div
							key={field.label}
							className="flex items-center justify-between gap-3 px-3 py-2"
						>
							<dt className={`shrink-0 text-xs ${mutedClass}`}>
								{field.label}
							</dt>
							<dd className="min-w-0 truncate text-right text-xs font-medium">
								{field.value}
							</dd>
						</div>
					))}
				</dl>

				<details className="mt-3">
					<summary className={`cursor-pointer text-xs ${mutedClass}`}>
						Raw message
					</summary>
					<pre
						className={`mt-2 max-h-32 overflow-auto rounded-md border p-2 text-[11px] leading-relaxed ${codeClass}`}
					>
						{pending.message}
					</pre>
				</details>

				<p className={`mt-3 text-xs ${mutedClass}`}>
					This signature does not submit a transaction or authorize a payment.
				</p>
				{error && <p className="mt-3 text-xs text-rose-500">{error}</p>}

				<div className="mt-5 flex justify-end gap-2">
					<button
						disabled={signing}
						type="button"
						className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
							isDark
								? "border-neutral-700 text-neutral-200 hover:bg-neutral-800"
								: "border-neutral-300 text-neutral-700 hover:bg-neutral-100"
						}`}
						onClick={onCancel}
					>
						Cancel
					</button>
					<button
						className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
						disabled={signing}
						type="button"
						onClick={onConfirm}
					>
						{signing ? "Opening wallet…" : "Sign in"}
					</button>
				</div>
			</div>
		</div>
	);
}

const WalletAuthSync = (): FunctionComponent => {
	const { connected, publicKey, signMessage, signTransaction } =
		useTinyplaceWallet();
	const clearSession = useAuthStore((state) => state.clearSession);
	const isDark = useAppStore((state) => state.theme === "dark");
	const [loginSignature, setLoginSignature] =
		useState<PendingLoginSignature | null>(null);
	const [loginSignatureError, setLoginSignatureError] = useState<string | null>(
		null
	);
	const [loginSignatureSigning, setLoginSignatureSigning] = useState(false);

	// Serialize establishment: one in-flight attempt at a time, and a short
	// cooldown so a burst of 401s can't prompt the wallet repeatedly. The active
	// wallet id guards against a stale attempt resolving after a disconnect.
	const inFlight = useRef<Promise<void> | null>(null);
	const lastAttemptMs = useRef(0);
	const activeWalletId = useRef<string | undefined>(undefined);
	// Provision the backend profile once per wallet per session, right after the
	// session is established — the profile is the source of truth and should
	// exist the moment the user signs in, not only after the onboarding wizard.
	const ensuredWallets = useRef<Set<string>>(new Set());

	const confirmLoginSignature = useCallback<SignMessageFunction>((data) => {
		return new Promise<Uint8Array>((resolve, reject) => {
			setLoginSignature({
				data: new Uint8Array(data),
				message: decodeSignatureMessage(data),
				reject,
				resolve,
			});
			setLoginSignatureError(null);
			setLoginSignatureSigning(false);
		});
	}, []);

	const cancelLoginSignature = useCallback((): void => {
		loginSignature?.reject(new Error("Login signature cancelled."));
		setLoginSignature(null);
		setLoginSignatureError(null);
		setLoginSignatureSigning(false);
	}, [loginSignature]);

	const signConfirmedLoginMessage = useCallback(async (): Promise<void> => {
		if (!loginSignature || !signMessage) {
			return;
		}
		setLoginSignatureSigning(true);
		setLoginSignatureError(null);
		try {
			const signature = await signMessage(loginSignature.data);
			loginSignature.resolve(signature);
			setLoginSignature(null);
		} catch (caught) {
			setLoginSignatureError(
				caught instanceof Error ? caught.message : "Wallet signature failed."
			);
		} finally {
			setLoginSignatureSigning(false);
		}
	}, [loginSignature, signMessage]);

	const ensureProfileOnce = useCallback(
		(walletId: string, signer: Signer): void => {
			if (ensuredWallets.current.has(walletId)) return;
			ensuredWallets.current.add(walletId);
			void ensureBackendProfile(signer);
		},
		[]
	);

	const establish = useCallback(
		(throttle: boolean, forceResign = false): void => {
			if (!(connected && publicKey && signMessage)) return;
			if (inFlight.current) return;
			const now = Date.now();
			if (throttle && now - lastAttemptMs.current < 5_000) return;
			lastAttemptMs.current = now;

			const publicKeyBytes = publicKey.toBytes();
			const walletId = publicKey.toBase58();
			// Restore a cached Sign-In-With-Solana proof, or ask the wallet for a
			// fresh one. If the user declines the sign-in proof, fall back to the
			// direct WalletSigner so custom per-request signatures still work.
			inFlight.current = SiwsProofSigner.createOrRestore(
				publicKeyBytes,
				confirmLoginSignature,
				{ forceNew: forceResign }
			)
				.then((signer) => {
					if (activeWalletId.current !== walletId) return;
					const walletSigner = signer.walletSigner;
					if (signTransaction) {
						walletSigner.walletSignTransaction = signTransaction;
					}
					setAuthSession(signer, walletSigner);
					ensureProfileOnce(walletId, signer);
				})
				.catch(() => {
					if (activeWalletId.current !== walletId) return;
					const fallback = new WalletSigner(publicKeyBytes, signMessage);
					if (signTransaction) {
						fallback.walletSignTransaction = signTransaction;
					}
					setAuthSession(fallback);
					ensureProfileOnce(walletId, fallback);
				})
				.finally(() => {
					inFlight.current = null;
				});
		},
		[
			connected,
			publicKey,
			signMessage,
			signTransaction,
			confirmLoginSignature,
			ensureProfileOnce,
		]
	);

	useEffect(() => {
		if (!(connected && publicKey && signMessage)) {
			activeWalletId.current = undefined;
			const pending = loginSignature;
			if (pending) {
				queueMicrotask(() => {
					pending.reject(new Error("Wallet disconnected."));
					setLoginSignature(null);
				});
			}
			clearSession();
			return;
		}
		activeWalletId.current = publicKey.toBase58();
		establish(false);
	}, [
		connected,
		publicKey,
		signMessage,
		clearSession,
		establish,
		loginSignature,
	]);

	// Re-establish when the backend rejects the session mid-use (revoked or
	// expired grant surfaced as a 401/403 via the API client).
	useEffect(() => {
		setSessionInvalidHandler((reason) => {
			const walletId = publicKey?.toBase58();
			if (reason?.forceResign && walletId) {
				clearSiwsProof(walletId);
			}
			establish(true, Boolean(reason?.forceResign));
		});
		return (): void => {
			setSessionInvalidHandler(undefined);
		};
	}, [establish, publicKey]);

	return loginSignature ? (
		<LoginSignatureDialog
			error={loginSignatureError}
			isDark={isDark}
			pending={loginSignature}
			signing={loginSignatureSigning}
			onCancel={cancelLoginSignature}
			onConfirm={signConfirmedLoginMessage}
		/>
	) : null;
};

type WalletContextProviderProperties = {
	children: ReactNode;
};

export const WalletContextProvider = ({
	children,
}: WalletContextProviderProperties): FunctionComponent => {
	const endpoint = useMemo(() => primarySolanaRpcUrl(), []);
	const connectionConfig = useMemo(() => solanaConnectionConfig(), []);
	const connection = useMemo(
		() => new Connection(endpoint, connectionConfig),
		[connectionConfig, endpoint]
	);
	const redirectUrl = useMemo(() => phantomRedirectUrl(), []);

	return (
		<PhantomProvider
			appIcon={PHANTOM_APP_ICON}
			appName="TinyPlace"
			theme={darkTheme}
			config={{
				addressTypes: [
					AddressType.ethereum,
					AddressType.solana,
					AddressType.sui,
				],
				appId: PHANTOM_APP_ID,
				authOptions: redirectUrl ? { redirectUrl } : undefined,
				providers: ["google", "apple", "injected"],
			}}
		>
			<ConnectionContext.Provider value={connection}>
				<PhantomWalletBridge>
					<WalletAuthSync />
					{children}
				</PhantomWalletBridge>
			</ConnectionContext.Provider>
		</PhantomProvider>
	);
};
