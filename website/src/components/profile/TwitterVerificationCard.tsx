"use client";

import type { TwitterChallengeResult } from "@tinyhumansai/tinyplace";
import { useEffect, useRef, useState, type ReactElement } from "react";

import {
	useRequestTwitterChallenge,
	useSubmitTwitterAttestation,
	useTwitterVerificationStatus,
} from "@src/hooks/use-reputation";

type TwitterVerificationCardProperties = {
	/** The owner's @handle (the reputation `agent`). */
	agent: string;
	/** The owner's cryptoId (the reputation `agentCryptoId`). */
	agentCryptoId: string;
	/** Fired once when the attestation reaches the verified state (e.g. so the
	 * onboarding wizard can mark the step complete). */
	onVerified?: () => void;
};

const inputClass =
	"w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-front placeholder:text-muted focus:border-primary focus:outline-none";
const buttonClass =
	"rounded-md bg-primary px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-50";

/**
 * Owner-only flow to verify a Twitter/X handle and earn the attestation. The
 * agent requests a challenge, tweets it, submits the tweet URL, and the card
 * polls the async verification status. Optional — it adds reputation but is
 * never required.
 */
export function TwitterVerificationCard({
	agent,
	agentCryptoId,
	onVerified,
}: TwitterVerificationCardProperties): ReactElement {
	const [handle, setHandle] = useState("");
	const [challenge, setChallenge] = useState<TwitterChallengeResult | null>(
		null
	);
	const [tweetUrl, setTweetUrl] = useState("");
	const [attestationId, setAttestationId] = useState<string | undefined>(
		undefined
	);

	const challengeMutation = useRequestTwitterChallenge();
	const submitMutation = useSubmitTwitterAttestation();
	const statusQuery = useTwitterVerificationStatus(
		attestationId,
		Boolean(attestationId)
	);

	const normalizedHandle = handle.trim().replace(/^@/, "");
	const status = statusQuery.data?.status;

	// Notify the parent once when verification lands (idempotent across the
	// status query's polling refetches).
	const notifiedRef = useRef(false);
	useEffect(() => {
		if (status === "verified" && !notifiedRef.current) {
			notifiedRef.current = true;
			onVerified?.();
		}
	}, [status, onVerified]);

	function requestChallenge(): void {
		challengeMutation.mutate(
			{ agent, agentCryptoId, handle: normalizedHandle },
			{
				onSuccess: (result): void => {
					setChallenge(result);
				},
			}
		);
	}

	function submitTweet(): void {
		submitMutation.mutate(
			{
				agent,
				agentCryptoId,
				platform: "twitter",
				handle: normalizedHandle,
				proofUrl: tweetUrl.trim(),
			},
			{
				onSuccess: (attestation): void => {
					setAttestationId(attestation.attestationId);
				},
			}
		);
	}

	function reset(): void {
		setChallenge(null);
		setTweetUrl("");
		setAttestationId(undefined);
	}

	return (
		<section className="rounded-lg border border-border bg-surface p-4">
			<h2 className="mb-1 text-sm font-medium text-front">
				Verify Twitter / X
			</h2>
			<p className="mb-3 text-xs text-muted">
				Prove you control a Twitter/X account to earn a verified badge and
				reputation. Optional.
			</p>

			{status === "verified" ? (
				<p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-500">
					Verified! @{normalizedHandle} is now linked to your profile.
				</p>
			) : !challenge ? (
				<div className="flex flex-col gap-2">
					<label className="text-xs text-muted" htmlFor="twitter-handle">
						Twitter / X handle
					</label>
					<div className="flex gap-2">
						<input
							className={inputClass}
							id="twitter-handle"
							placeholder="@yourhandle"
							value={handle}
							onChange={(event): void => {
								setHandle(event.target.value);
							}}
						/>
						<button
							className={buttonClass}
							disabled={!normalizedHandle || challengeMutation.isPending}
							type="button"
							onClick={requestChallenge}
						>
							{challengeMutation.isPending ? "Requesting…" : "Get challenge"}
						</button>
					</div>
					{challengeMutation.isError && (
						<p className="text-xs text-danger">
							{challengeMutation.error.message}
						</p>
					)}
				</div>
			) : (
				<div className="flex flex-col gap-3">
					<div>
						<p className="mb-1 text-xs text-muted">
							1. Post this exact text as a tweet from @{normalizedHandle}:
						</p>
						<pre className="overflow-x-auto rounded-md border border-border bg-bg px-3 py-2 text-xs text-front">
							{challenge.challengeCode}
						</pre>
						<div className="mt-2 flex gap-2">
							<a
								className={buttonClass}
								rel="noopener noreferrer"
								target="_blank"
								href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(
									challenge.challengeCode
								)}`}
							>
								Open Twitter
							</a>
							<button
								className="rounded-md border border-border px-3 py-2 text-sm font-medium text-front transition-colors hover:bg-bg"
								type="button"
								onClick={(): void => {
									void navigator.clipboard?.writeText(challenge.challengeCode);
								}}
							>
								Copy
							</button>
						</div>
					</div>
					<div>
						<label className="text-xs text-muted" htmlFor="tweet-url">
							2. Paste the tweet URL
						</label>
						<div className="mt-1 flex gap-2">
							<input
								className={inputClass}
								id="tweet-url"
								placeholder="https://x.com/handle/status/123…"
								value={tweetUrl}
								onChange={(event): void => {
									setTweetUrl(event.target.value);
								}}
							/>
							<button
								className={buttonClass}
								disabled={!tweetUrl.trim() || submitMutation.isPending}
								type="button"
								onClick={submitTweet}
							>
								{submitMutation.isPending ? "Submitting…" : "Verify"}
							</button>
						</div>
						{submitMutation.isError && (
							<p className="mt-1 text-xs text-danger">
								{submitMutation.error.message}
							</p>
						)}
					</div>

					{attestationId && status !== "failed" && (
						<p className="text-xs text-muted">
							Verification in progress — checking your tweet against the Twitter
							API. This can take a moment.
						</p>
					)}
					{status === "failed" && (
						<div className="flex items-center justify-between gap-2">
							<p className="text-xs text-danger">
								{statusQuery.data?.reason ?? "Verification failed."}
							</p>
							<button
								className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-front hover:bg-bg"
								type="button"
								onClick={reset}
							>
								Try again
							</button>
						</div>
					)}
				</div>
			)}
		</section>
	);
}
