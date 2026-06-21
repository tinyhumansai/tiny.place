"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import {
	TinyPlaceError,
	type X402AuthorizationFields,
} from "@tinyhumansai/tinyplace";
import { apiErrorMessage } from "@src/common/api-error";
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
import {
	MIN_HANDLE_LENGTH,
	useHandleAvailability,
} from "@src/hooks/use-registry";
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
	const { t } = useTranslation();
	// Sign with the connected wallet / SIWS signer, like every other
	// authenticated action. The handle binds to the wallet key (see `publicKey`
	// below) and `agentId` is the wallet cryptoId, so the identity is owned by
	// the wallet.
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
	// Gate the verdict UI on the same normalized (de-`@`-ed) length the
	// availability query enables on, so `@a` can't desync the hint from the query.
	const normalizedNameLength = searchName.replace(/^@/, "").length;
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
				throw new Error(t("domainRegistration.connectWalletFirst"));
			}

			// A handle is just a pointer now. Profile details live on the wallet's
			// User profile and are edited from the profile page.
			// A Solana cryptoId IS the wallet's ed25519 public key, so the SDK
			// derives publicKey from cryptoId — no need to pass it. The handle binds
			// to the WALLET key (which derives agentId), not the ephemeral session
			// key that signs the request.
			const request = {
				username: selectedName,
				cryptoId: agentId,
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
									title: t("domainRegistration.confirmTitle"),
									subject: selectedName,
									amount: challengePayment.amount,
									asset: challengePayment.asset,
									recipient: challengePayment.to,
									note: t("domainRegistration.confirmNote"),
									confirmLabel: t("domainRegistration.confirmLabel"),
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
					{t("domainRegistration.registeredTitle")}
				</h3>
				<p className={`mt-2 text-sm ${secondaryClass}`}>
					<span className="font-mono font-medium">{selectedName}</span>{" "}
					{t("domainRegistration.registeredDescription")}
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
					{t("domainRegistration.registerAnother")}
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
								{t("domainRegistration.registerName", { name: selectedName })}
							</h3>
							<p className={`mt-0.5 text-xs ${secondaryClass}`}>
								{t("domainRegistration.annualFee", {
									fee: formatFee(getAnnualFee(selectedName)),
								})}
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
							{t("domainRegistration.change")}
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
						{t("domainRegistration.setAsPrimary")}
						<span className={secondaryClass}>
							{hasExistingPrimary
								? t("domainRegistration.primaryReplacesHint")
								: t("domainRegistration.primaryDisplayHint")}
						</span>
					</label>
				</div>

				{!signer && (
					<p className={`text-xs ${secondaryClass}`}>
						{t("domainRegistration.connectToRegisterDomain")}
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
						? t("domainRegistration.signingAndRegistering")
						: t("domainRegistration.authorizeAndRegister", {
								amount: paymentChallenge
									? formatTokenAmount(
											paymentChallenge.payment.amount,
											paymentChallenge.payment.asset
										)
									: formatFee(getAnnualFee(selectedName)),
							})}
				</button>

				{paymentChallenge ? (
					<p className={`text-xs ${secondaryClass}`}>
						{t("domainRegistration.paymentChallenge", {
							error: paymentChallenge.error,
							amount: formatTokenAmount(
								paymentChallenge.payment.amount,
								paymentChallenge.payment.asset
							),
							network: paymentChallenge.payment.network,
						})}
					</p>
				) : null}

				{registerMutation.isError && (
					<p className="text-xs text-red-500">
						{apiErrorMessage(
							registerMutation.error,
							t("domainRegistration.registrationFailed")
						)}
					</p>
				)}
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div className={`rounded-lg border p-4 ${cardClass}`}>
				<h3 className={`mb-2 text-sm font-semibold ${headingClass}`}>
					{t("domainRegistration.registerDomainTitle")}
				</h3>
				<div className="flex gap-2">
					<input
						className={`flex-1 rounded-md border px-3 py-2 text-sm ${inputClass}`}
						placeholder={t("domainRegistration.searchPlaceholder")}
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
						{t("domainRegistration.check")}
					</button>
				</div>

				{normalizedNameLength > 0 &&
					normalizedNameLength < MIN_HANDLE_LENGTH && (
						<p className={`mt-2 text-xs ${secondaryClass}`}>
							{t("domainRegistration.minLength", { count: MIN_HANDLE_LENGTH })}
						</p>
					)}

				{availabilityQuery.isLoading &&
					normalizedNameLength >= MIN_HANDLE_LENGTH && (
						<p className={`mt-2 text-xs ${secondaryClass}`}>
							{t("domainRegistration.checking")}
						</p>
					)}

				{availabilityQuery.isError &&
					normalizedNameLength >= MIN_HANDLE_LENGTH && (
						<p className="mt-2 text-xs font-medium text-red-500">
							{t("domainRegistration.availabilityError")}
						</p>
					)}

				{availabilityQuery.data && (
					<div className="mt-3">
						{availabilityQuery.data.available ? (
							<div className="flex items-center justify-between">
								<div>
									<span className="text-xs font-medium text-green-500">
										{t("domainRegistration.available")}
									</span>
									<span className={`ml-2 text-xs ${secondaryClass}`}>
										{t("domainRegistration.feePerYear", {
											fee: formatFee(getAnnualFee(searchName)),
										})}
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
									{t("domainRegistration.register")}
								</button>
							</div>
						) : (
							<div>
								<span className="text-xs font-medium text-red-500">
									{t("domainRegistration.taken")}
								</span>
								{availabilityQuery.data.identity && (
									<span className={`ml-2 text-xs ${secondaryClass}`}>
										{t("domainRegistration.ownedBy")}{" "}
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
					{t("domainRegistration.pricing")}
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
							<span className="font-medium">
								{t("domainRegistration.feePerYearShort", { fee: tier.fee })}
							</span>
						</div>
					))}
				</div>
			</div>
		</div>
	);
};
