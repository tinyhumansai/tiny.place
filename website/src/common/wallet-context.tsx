"use client";

import {
	ConnectionProvider,
	WalletProvider,
	useWallet,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import type { Adapter } from "@solana/wallet-adapter-base";
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from "react";

import type { FunctionComponent } from "@src/common/types";
import { createClient } from "@src/common/api-client";
import {
	SessionWalletSigner,
	WalletSigner,
	setAuthSession,
} from "@src/common/auth-payment";
import { setSessionInvalidHandler } from "@src/common/session-recovery";
import {
	primarySolanaRpcUrl,
	solanaConnectionConfig,
} from "@src/common/solana-rpc";
import { useAuthStore } from "@src/store/auth";
import { useAppStore } from "@src/store/app";

import "@solana/wallet-adapter-react-ui/styles.css";

type SignMessageFunction = (message: Uint8Array) => Promise<Uint8Array>;

type PendingLoginSignature = {
	data: Uint8Array;
	message: string;
	reject: (error: unknown) => void;
	resolve: (signature: Uint8Array) => void;
};

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
		return [{ label: "Message", value: message || "Wallet signature request" }];
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
				<h3 className="text-sm font-semibold">Approve browser session</h3>
				<p className={`mt-1 text-xs ${mutedClass}`}>
					Your wallet will sign this session approval for tiny.place.
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
					This signature does not submit a transaction. It approves a temporary
					browser session so tiny.place can sign app requests without prompting
					your wallet every time.
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
						{signing ? "Opening wallet…" : "Continue to wallet"}
					</button>
				</div>
			</div>
		</div>
	);
}

const WalletAuthSync = (): FunctionComponent => {
	const { connected, publicKey, signMessage, signTransaction } = useWallet();
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

	const establish = useCallback(
		(throttle: boolean): void => {
			if (!(connected && publicKey && signMessage)) return;
			if (inFlight.current) return;
			const now = Date.now();
			if (throttle && now - lastAttemptMs.current < 5_000) return;
			lastAttemptMs.current = now;

			const publicKeyBytes = publicKey.toBytes();
			const walletId = publicKey.toBase58();
			// Restore a persisted hot session wallet — or, if none is valid, approve
			// a fresh one with a single wallet signature. Once established, the
			// in-memory session key signs everything afterwards. If the user declines
			// the approval (or it fails), fall back to the direct WalletSigner, which
			// still works but prompts the wallet per request.
			inFlight.current = SessionWalletSigner.restoreOrEstablish(
				publicKeyBytes,
				// Raw wallet signMessage backs the persistent grantor/identity signer,
				// so wallet-only acts (identity registration, x402 payments) prompt the
				// wallet directly. The session-approval dialog is used ONLY for the
				// one-time grant signature, passed as approveSignMessage below.
				signMessage,
				createClient,
				confirmLoginSignature
			)
				.then((signer) => {
					if (activeWalletId.current !== walletId) return;
					// Attach the wallet's transaction signer so the delegated-payment
					// path can sign the one-time on-chain spend approval (Phantom signs
					// transactions via signTransaction, never via signMessage).
					if (signTransaction) {
						signer.walletSignTransaction = signTransaction;
					}
					// The session key signs routine calls, but registration must be
					// signed by the wallet (grantor), whose key derives the cryptoId.
					setAuthSession(signer, signer.walletSigner);
				})
				.catch(() => {
					if (activeWalletId.current !== walletId) return;
					const fallback = new WalletSigner(publicKeyBytes, signMessage);
					setAuthSession(fallback);
				})
				.finally(() => {
					inFlight.current = null;
				});
		},
		[connected, publicKey, signMessage, signTransaction, confirmLoginSignature]
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
		setSessionInvalidHandler(() => {
			establish(true);
		});
		return (): void => {
			setSessionInvalidHandler(undefined);
		};
	}, [establish]);

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
	// Phantom (and other modern wallets) register themselves as Standard Wallets
	// and are auto-detected, so no explicit adapter is needed — passing one makes
	// the adapter warn that it can be removed.
	const wallets = useMemo<Array<Adapter>>(() => [], []);

	return (
		<ConnectionProvider config={connectionConfig} endpoint={endpoint}>
			<WalletProvider autoConnect wallets={wallets}>
				<WalletModalProvider>
					<WalletAuthSync />
					{children}
				</WalletModalProvider>
			</WalletProvider>
		</ConnectionProvider>
	);
};
