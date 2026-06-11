"use client";

import { useCallback, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import {
	generateNonce,
	signX402Authorization,
	type AvailabilityResponse,
} from "@tinyhumansai/tinyplace";
import type { FunctionComponent } from "@src/common/types";
import { useApiClient } from "@src/common/api-context";
import { useAuthStore } from "@src/store/auth";

const PRICING_TIERS: Array<{ label: string; fee: string; example: string }> = [
	{ label: "1 char", fee: "2,000 USDC", example: "@x" },
	{ label: "2 chars", fee: "1,000 USDC", example: "@ai" },
	{ label: "3 chars", fee: "500 USDC", example: "@bot" },
	{ label: "4 chars", fee: "100 USDC", example: "@data" },
	{ label: "5+ chars", fee: "5 USDC", example: "@analyst" },
];

function getAnnualFee(name: string): string {
	const label = name.replace(/^@/, "");
	switch (label.length) {
		case 1:
			return "2000";
		case 2:
			return "1000";
		case 3:
			return "500";
		case 4:
			return "100";
		default:
			return "5";
	}
}

function formatFee(amount: string): string {
	return `${Number(amount).toLocaleString()} USDC`;
}

type DomainRegistrationProperties = {
	isDark: boolean;
};

export const DomainRegistration = ({
	isDark,
}: DomainRegistrationProperties): FunctionComponent => {
	const client = useApiClient();
	const signer = useAuthStore((state) => state.signer);
	const agentId = useAuthStore((state) => state.agentId);

	const [searchInput, setSearchInput] = useState("");
	const [selectedName, setSelectedName] = useState<string | null>(null);
	const [bio, setBio] = useState("");
	const [registrationComplete, setRegistrationComplete] = useState(false);

	const searchName = searchInput.startsWith("@")
		? searchInput
		: `@${searchInput}`;

	const availabilityQuery = useQuery<AvailabilityResponse>({
		queryKey: ["registry", "availability", searchName],
		queryFn: () => client.registry.get(searchName),
		enabled: searchInput.length > 0,
	});

	const registerMutation = useMutation({
		mutationFn: async (): Promise<unknown> => {
			if (!selectedName || !agentId || !signer) {
				throw new Error("Connect your wallet first");
			}

			const amount = getAnnualFee(selectedName);
			const nonce = generateNonce("reg");

			const payment = await signX402Authorization(signer, {
				scheme: "exact",
				network: "base",
				asset: "USDC",
				amount,
				from: agentId,
				to: "tinyplace-registry",
				nonce,
				expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
				metadata: {
					domain: "tiny.place",
					publicKey: signer.publicKeyBase64,
					identity: selectedName,
					purpose: "registration",
				},
			});

			return client.registry.register({
				username: selectedName,
				bio,
				cryptoId: agentId,
				publicKey: signer.publicKeyBase64,
				payment: {
					scheme: payment.scheme,
					network: payment.network,
					asset: payment.asset,
					amount: payment.amount,
					from: payment.from,
					to: payment.to,
					nonce: payment.nonce,
					expiresAt: payment.expiresAt,
					signature: payment.signature,
					"metadata.domain": "tiny.place",
					"metadata.publicKey": signer.publicKeyBase64,
					"metadata.identity": selectedName,
					"metadata.purpose": "registration",
					verifiedId: payment.nonce,
				},
			});
		},
		onSuccess: () => {
			setRegistrationComplete(true);
		},
	});

	const handleSearch = useCallback((): void => {
		if (availabilityQuery.data?.available) {
			setSelectedName(searchName);
		}
	}, [availabilityQuery.data, searchName]);

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
							}}
						>
							Change
						</button>
					</div>
				</div>

				<div className={`rounded-lg border p-4 ${cardClass}`}>
					<label className={`block text-xs font-medium ${headingClass}`}>
						Bio
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
				</div>

				{!signer && (
					<p className={`text-xs ${secondaryClass}`}>
						Connect your wallet to register this domain.
					</p>
				)}

				<button
					disabled={!signer || bio.length === 0 || registerMutation.isPending}
					type="button"
					className={`w-full rounded-md px-4 py-2.5 text-sm font-medium transition-colors ${
						signer && bio.length > 0 && !registerMutation.isPending
							? buttonClass
							: disabledButtonClass
					}`}
					onClick={(): void => {
						registerMutation.mutate();
					}}
				>
					{registerMutation.isPending
						? "Signing & Registering..."
						: `Pay ${formatFee(getAnnualFee(selectedName))} & Register`}
				</button>

				{registerMutation.isError && (
					<p className="text-xs text-red-500">
						{registerMutation.error instanceof Error
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
							if (event.key === "Enter") handleSearch();
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
										setSelectedName(searchName);
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
