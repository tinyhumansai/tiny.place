"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";

import {
	generateNonce,
	signX402Authorization,
	TinyVerseError,
	x402AuthorizationToPaymentMap,
	type X402AuthorizationFields,
} from "@tinyhumansai/tinyplace";
import type { FunctionComponent } from "@src/common/types";
import {
	formatFee,
	getAnnualFee,
	PRICING_TIERS,
} from "@src/components/explore/domain-pricing";
import { createClient } from "@src/common/api-client";
import { assertValidX402Challenge } from "@src/common/x402-challenge";
import { useHandleAvailability } from "@src/hooks/use-registry";
import { useOwnedIdentities } from "@src/hooks/use-marketplace";
import { useAuthStore } from "@src/store/auth";

function normalizedHandle(value: string): string {
	const normalized = value.trim().replace(/^@+/, "");
	return normalized ? `@${normalized}` : "";
}

// Parse a free-text links field (one URL per line or comma-separated) into a
// clean list of non-empty URLs.
function parseLinks(value: string): Array<string> {
	return value
		.split(/[\n,]/)
		.map((link) => link.trim())
		.filter((link) => link.length > 0);
}

type RegistryPaymentChallenge = {
	error: string;
	payment: Omit<X402AuthorizationFields, "expiresAt" | "nonce"> &
		Partial<Pick<X402AuthorizationFields, "expiresAt" | "nonce">>;
};

function registryPaymentChallenge(
	error: unknown
): RegistryPaymentChallenge | null {
	if (!(error instanceof TinyVerseError) || error.status !== 402) {
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
	// Registration binds the cryptoId to the public key, an act the backend
	// rejects under session-key delegation (it requires base58(publicKey) ===
	// cryptoId). So we sign with the identity signer — the wallet itself — whose
	// key derives the agentId, not the hot session key used for routine calls.
	const identitySigner = useAuthStore((state) => state.identitySigner);
	const agentId = useAuthStore((state) => state.agentId);
	const signer = identitySigner;
	const client = useMemo(() => createClient(identitySigner), [identitySigner]);

	const [searchInput, setSearchInput] = useState("");
	const [selectedName, setSelectedName] = useState<string | null>(null);
	const [bio, setBio] = useState("");
	const [links, setLinks] = useState("");
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

			const parsedLinks = parseLinks(links);
			const request = {
				username: selectedName,
				cryptoId: agentId,
				publicKey: signer.publicKeyBase64,
				primary,
				...(bio.trim() ? { bio: bio.trim() } : {}),
				...(parsedLinks.length > 0
					? { metadata: { links: parsedLinks } }
					: {}),
			};

			try {
				return await client.registry.register(request);
			} catch (error) {
				const challenge = registryPaymentChallenge(error);
				if (!challenge) {
					throw error;
				}
				setPaymentChallenge(challenge);
				const challengePayment = challenge.payment;
				// The exact registration fee is authoritative from the server (and is
				// in the asset's minor units, not the decimal-USDC preview), so we
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
				const signedPayment = await signX402Authorization(signer, {
					...challengePayment,
					expiresAt:
						challengePayment.expiresAt ??
						new Date(Date.now() + 5 * 60 * 1000).toISOString(),
					from: agentId,
					metadata,
					nonce: challengePayment.nonce || generateNonce("reg"),
				});
				return client.registry.register({
					...request,
					payment: x402AuthorizationToPaymentMap(signedPayment),
				});
			}
		},
		onSuccess: () => {
			setPaymentChallenge(null);
			setRegistrationComplete(true);
		},
	});

	const handleSearch = useCallback((): void => {
		if (availabilityQuery.data?.available) {
			setSelectedName(availabilityQuery.data.name);
			setPaymentChallenge(null);
		}
	}, [availabilityQuery.data]);

	const cardClass = isDark
		? "border-neutral-800 bg-neutral-950"
		: "border-neutral-200 bg-neutral-50";
	const inputClass = isDark
		? "border-neutral-700 bg-neutral-900 text-white placeholder:text-neutral-600"
		: "border-neutral-300 bg-white text-black placeholder:text-neutral-400";
	const headingClass = isDark ? "text-white" : "text-black";
	const secondaryClass = isDark ? "text-neutral-400" : "text-neutral-500";
	const buttonClass = isDark
		? "bg-white text-black hover:bg-neutral-200"
		: "bg-black text-white hover:bg-neutral-800";
	const disabledButtonClass = isDark
		? "bg-neutral-800 text-neutral-500 cursor-not-allowed"
		: "bg-neutral-200 text-neutral-400 cursor-not-allowed";

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
						setBio("");
						setLinks("");
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

				<div className={`space-y-3 rounded-lg border p-4 ${cardClass}`}>
					<label className={`block text-xs font-medium ${headingClass}`}>
						Bio <span className={secondaryClass}>(optional)</span>
						<textarea
							className={`mt-1 w-full rounded-md border px-3 py-2 text-sm ${inputClass}`}
							placeholder="Describe your agent's purpose and capabilities..."
							rows={3}
							value={bio}
							onChange={(event): void => {
								setBio(event.target.value);
							}}
						/>
					</label>
					<label className={`block text-xs font-medium ${headingClass}`}>
						Links <span className={secondaryClass}>(optional, one per line)</span>
						<textarea
							className={`mt-1 w-full rounded-md border px-3 py-2 text-sm ${inputClass}`}
							placeholder={"https://github.com/your-agent\nhttps://x.com/your-agent"}
							rows={2}
							value={links}
							onChange={(event): void => {
								setLinks(event.target.value);
							}}
						/>
					</label>
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
						: `Authorize ${formatFee(
								paymentChallenge?.payment.amount ?? getAnnualFee(selectedName)
							)} & Register`}
				</button>

				{paymentChallenge ? (
					<p className={`text-xs ${secondaryClass}`}>
						Payment challenge: {paymentChallenge.error} for{" "}
						{formatFee(paymentChallenge.payment.amount)} on{" "}
						{paymentChallenge.payment.network}.
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
							setSearchInput(event.target.value);
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
