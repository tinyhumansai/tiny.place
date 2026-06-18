"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
	identityPublicKey,
	TinyPlaceError,
	type X402AuthorizationFields,
} from "@tinyhumansai/tinyplace";
import { formatTokenAmount } from "@src/common/format-amount";
import type { FunctionComponent } from "@src/common/types";
import {
	formatFee,
	getAnnualFee,
	PRICING_TIERS,
} from "@src/components/explore/domain-pricing";
import { sanitizeHandle } from "@src/components/explore/identity-management";
import { createClient } from "@src/common/api-client";
import { queryKeys } from "@src/common/query-keys";
import { assertValidX402Challenge } from "@src/common/x402-challenge";
import { signX402ChallengePaymentMap } from "@src/common/auth-payment";
import { useHandleAvailability } from "@src/hooks/use-registry";
import { useOwnedIdentities } from "@src/hooks/use-marketplace";
import { useAuthStore } from "@src/store/auth";

import { useOptionalX402Confirm } from "./x402-confirm";

function normalizedHandle(value: string): string {
	const normalized = value.trim().replace(/^@+/, "");
	return normalized ? `@${normalized}` : "";
}

type RegistryPaymentChallenge = {
	error: string;
	payment: Omit<X402AuthorizationFields, "expiresAt" | "nonce"> &
		Partial<Pick<X402AuthorizationFields, "expiresAt" | "nonce">>;
};

function registryPaymentChallenge(
	error: unknown
): RegistryPaymentChallenge | null {
	if (!(error instanceof TinyPlaceError) || error.status !== 402) {
		return null;
	}
	if (!error.body || typeof error.body !== "object") {
		return null;
	}
	const body = error.body as Partial<RegistryPaymentChallenge>;
	if (!body.payment || typeof body.payment !== "object") {
		return null;
	}
	return {
		error: body.error ?? "Payment required",
		payment: body.payment,
	};
}

type DomainRegistrationProperties = {
	isDark: boolean;
};

export const DomainRegistration = ({
	isDark,
}: DomainRegistrationProperties): FunctionComponent => {
	// Sign with the hot SESSION signer, like every other authenticated action —
	// the wallet only ever signs the one-time session grant. The handle still
	// binds to the WALLET key (see `publicKey` below), and the backend authorizes
	// the session key as the wallet's approved delegate (`verifyOwnershipOrDelegate`).
	// `agentId` is the wallet cryptoId either way (the session reports it as its
	// agentId), so the identity is owned by the wallet, not the ephemeral key.
	const signer = useAuthStore((state) => state.signer);
	const agentId = useAuthStore((state) => state.agentId);
	const client = useMemo(() => createClient(signer), [signer]);
	const confirmX402 = useOptionalX402Confirm();
	const queryClient = useQueryClient();

	const [searchInput, setSearchInput] = useState("");
	const [selectedName, setSelectedName] = useState<string | null>(null);
	// null = follow the auto-primary default; true/false = explicit user choice.
	const [primaryChoice, setPrimaryChoice] = useState<boolean | null>(null);
	const [registrationComplete, setRegistrationComplete] = useState(false);
	const [paymentChallenge, setPaymentChallenge] =
		useState<RegistryPaymentChallenge | null>(null);

	const searchName = normalizedHandle(searchInput);
	const availabilityQuery = useHandleAvailability(searchName);

	// A wallet's first name is auto-assigned as primary; offer the toggle
	// defaulted on only when the wallet has no primary yet.
	const ownedIdentities = useOwnedIdentities(agentId);
	const hasExistingPrimary = Boolean(
		ownedIdentities.data?.identities?.some((identity) => identity.primary)
	);
	const primary = primaryChoice ?? !hasExistingPrimary;

	const registerMutation = useMutation({
		mutationFn: async (): Promise<unknown> => {
			if (!selectedName || !agentId || !signer) {
				throw new Error("Connect your wallet first");
			}

			// A handle is just a pointer now. Profile details live on the wallet's
			// User profile and are edited from the profile page.
			const request = {
				username: selectedName,
				cryptoId: agentId,
				// The handle binds to the WALLET key (which derives agentId), not the
				// ephemeral session key that signs the request. identityPublicKey()
				// returns the wallet key for a session signer, the signer's own key
				// otherwise.
				publicKey: identityPublicKey(signer) ?? signer.publicKeyBase64,
				primary,
				actorType: "human" as const,
			};

			return (async (): Promise<unknown> => {
				try {
					return await client.registry.register(request);
				} catch (error) {
					const challenge = registryPaymentChallenge(error);
					if (!challenge) {
						throw error;
					}
					setPaymentChallenge(challenge);
					const challengePayment = challenge.payment;
					// The exact registration fee is authoritative from the server (and
					// is in the asset's minor units, not the decimal-USDC preview), so we
					// can't bind an exact amount client-side here. Guard at minimum that
					// the money-bearing fields are present and well-formed before signing.
					assertValidX402Challenge(challengePayment);
					const metadata = {
						...challengePayment.metadata,
						domain: challengePayment.metadata?.["domain"] ?? "tiny.place",
						identity: challengePayment.metadata?.["identity"] ?? selectedName,
						publicKey: signer.publicKeyBase64,
						purpose: challengePayment.metadata?.["purpose"] ?? "registration",
					};
					// Sign the x402 authorization, then settle + register. register()
					// resolves only after the backend confirms the settlement on-chain
					// (it waits for finalization), so running this inside the confirm
					// dialog keeps it in "Confirming…" until the payment is actually
					// settled — not merely signed — and surfaces a settlement failure
					// as a dialog error the user can retry.
					const signAndRegister = async (): Promise<unknown> => {
						const payment = await signX402ChallengePaymentMap({
							fallbackFrom: agentId,
							metadata,
							noncePrefix: "reg",
							payment: challengePayment,
							signer,
						});
						return client.registry.register({ ...request, payment });
					};
					return confirmX402
						? confirmX402(
								{
									title: "Register identity",
									subject: selectedName,
									amount: challengePayment.amount,
									asset: challengePayment.asset,
									recipient: challengePayment.to,
									note: "Sign the x402 authorization and register — this waits for on-chain settlement to confirm.",
									confirmLabel: "Sign x402",
								},
								signAndRegister
							)
						: signAndRegister();
				}
			})();
		},
		onSuccess: () => {
			setPaymentChallenge(null);
			setRegistrationComplete(true);
			void queryClient.invalidateQueries({
				queryKey: queryKeys.directory.identities(),
			});
			if (agentId) {
				void queryClient.invalidateQueries({
					queryKey: queryKeys.directory.reverse(agentId),
				});
			}
			if (selectedName) {
				void queryClient.invalidateQueries({
					queryKey: queryKeys.registry.availability(
						selectedName.trim().replace(/^@+/, "")
					),
				});
			}
		},
	});

	const handleSearch = useCallback((): void => {
		if (availabilityQuery.data?.available) {
			setSelectedName(availabilityQuery.data.name);
			setPaymentChallenge(null);
		}
	}, [availabilityQuery.data]);

	const cardClass = "theme-surface-card";
	const inputClass = "theme-input";
	const headingClass = isDark ? "text-white" : "text-black";
	const secondaryClass = isDark ? "text-neutral-400" : "text-neutral-500";
	const buttonClass = "theme-primary-action";
	const disabledButtonClass = "theme-disabled-action";

	if (registrationComplete) {
		return (
			<div className={`rounded-lg border p-6 text-center ${cardClass}`}>
				<div className="mb-3 text-2xl">&#10003;</div>
				<h3 className={`text-lg font-semibold ${headingClass}`}>
					Domain Registered
				</h3>
				<p className={`mt-2 text-sm ${secondaryClass}`}>
					<span className="font-mono font-medium">{selectedName}</span> is now
					yours. It will appear in the directory shortly.
				</p>
				<button
					className={`mt-4 rounded-md px-4 py-2 text-sm font-medium transition-colors ${buttonClass}`}
					type="button"
					onClick={(): void => {
						setRegistrationComplete(false);
						setSelectedName(null);
						setSearchInput("");
						setPrimaryChoice(null);
						setPaymentChallenge(null);
					}}
				>
					Register Another
				</button>
			</div>
		);
	}

	if (selectedName) {
		return (
			<div className="space-y-4">
				<div className={`rounded-lg border p-4 ${cardClass}`}>
					<div className="flex items-center justify-between">
						<div>
							<h3 className={`text-sm font-semibold ${headingClass}`}>
								Register {selectedName}
							</h3>
							<p className={`mt-0.5 text-xs ${secondaryClass}`}>
								Annual fee: {formatFee(getAnnualFee(selectedName))}
							</p>
						</div>
						<button
							className={`text-xs ${secondaryClass} hover:underline`}
							type="button"
							onClick={(): void => {
								setSelectedName(null);
								setPaymentChallenge(null);
							}}
						>
							Change
						</button>
					</div>
				</div>

				<div className={`rounded-lg border p-4 ${cardClass}`}>
					<label
						className={`flex items-center gap-2 text-xs font-medium ${headingClass}`}
					>
						<input
							checked={primary}
							type="checkbox"
							onChange={(event): void => {
								setPrimaryChoice(event.target.checked);
							}}
						/>
						Set as primary handle
						<span className={secondaryClass}>
							{hasExistingPrimary
								? "(replaces your current primary)"
								: "(your wallet's display identity)"}
						</span>
					</label>
				</div>

				{!signer && (
					<p className={`text-xs ${secondaryClass}`}>
						Connect your wallet to register this domain.
					</p>
				)}

				<button
					disabled={!signer || registerMutation.isPending}
					type="button"
					className={`w-full rounded-md px-4 py-2.5 text-sm font-medium transition-colors ${
						signer && !registerMutation.isPending
							? buttonClass
							: disabledButtonClass
					}`}
					onClick={(): void => {
						registerMutation.mutate();
					}}
				>
					{registerMutation.isPending
						? "Signing & Registering..."
						: `Authorize ${
								paymentChallenge
									? formatTokenAmount(
											paymentChallenge.payment.amount,
											paymentChallenge.payment.asset
										)
									: formatFee(getAnnualFee(selectedName))
							} & Register`}
				</button>

				{paymentChallenge ? (
					<p className={`text-xs ${secondaryClass}`}>
						Payment challenge: {paymentChallenge.error} for{" "}
						{formatTokenAmount(
							paymentChallenge.payment.amount,
							paymentChallenge.payment.asset
						)}{" "}
						on {paymentChallenge.payment.network}.
					</p>
				) : null}

				{registerMutation.isError && (
					<p className="text-xs text-red-500">
						{registryPaymentChallenge(registerMutation.error)
							? "Registration still requires a valid settled x402 payment."
							: registerMutation.error instanceof Error
								? registerMutation.error.message
								: "Registration failed"}
					</p>
				)}
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div className={`rounded-lg border p-4 ${cardClass}`}>
				<h3 className={`mb-2 text-sm font-semibold ${headingClass}`}>
					Register a Domain
				</h3>
				<div className="flex gap-2">
					<input
						className={`flex-1 rounded-md border px-3 py-2 text-sm ${inputClass}`}
						placeholder="Search for a name..."
						type="text"
						value={searchInput}
						onChange={(event): void => {
							setSearchInput(sanitizeHandle(event.target.value));
						}}
						onKeyDown={(event): void => {
							if (event.key === "Enter") {
								handleSearch();
							}
						}}
					/>
					<button
						disabled={searchInput.length === 0}
						type="button"
						className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
							searchInput.length > 0 ? buttonClass : disabledButtonClass
						}`}
						onClick={handleSearch}
					>
						Check
					</button>
				</div>

				{availabilityQuery.isLoading && searchInput.length > 0 && (
					<p className={`mt-2 text-xs ${secondaryClass}`}>Checking...</p>
				)}

				{availabilityQuery.data && (
					<div className="mt-3">
						{availabilityQuery.data.available ? (
							<div className="flex items-center justify-between">
								<div>
									<span className="text-xs font-medium text-green-500">
										Available
									</span>
									<span className={`ml-2 text-xs ${secondaryClass}`}>
										{formatFee(getAnnualFee(searchName))}/year
									</span>
								</div>
								<button
									className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${buttonClass}`}
									type="button"
									onClick={(): void => {
										setSelectedName(availabilityQuery.data.name);
										setPaymentChallenge(null);
									}}
								>
									Register
								</button>
							</div>
						) : (
							<div>
								<span className="text-xs font-medium text-red-500">Taken</span>
								{availabilityQuery.data.identity && (
									<span className={`ml-2 text-xs ${secondaryClass}`}>
										Owned by{" "}
										<span className="font-mono">
											{availabilityQuery.data.identity.cryptoId.slice(0, 12)}...
										</span>
									</span>
								)}
							</div>
						)}
					</div>
				)}
			</div>

			<div className={`rounded-lg border p-4 ${cardClass}`}>
				<h4 className={`mb-2 text-xs font-semibold ${headingClass}`}>
					Pricing
				</h4>
				<div className="space-y-1">
					{PRICING_TIERS.map((tier) => (
						<div
							key={tier.label}
							className={`flex items-center justify-between text-xs ${secondaryClass}`}
						>
							<span>
								{tier.label}{" "}
								<span className="font-mono opacity-60">({tier.example})</span>
							</span>
							<span className="font-medium">{tier.fee}/yr</span>
						</div>
					))}
				</div>
			</div>
		</div>
	);
};
