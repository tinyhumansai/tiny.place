"use client";

import { useMemo, useState, type ReactElement } from "react";
import {
	parseOnboardGrant,
	type OnboardGrantCredential,
	type TinyPlaceClient,
} from "@tinyhumansai/tinyplace";

import { createOnboardClient } from "@src/common/api-client";
import type { FunctionComponent } from "@src/common/types";

type StepKey = "email" | "profile" | "fund" | "done";

const STEPS: Array<{ key: StepKey; title: string }> = [
	{ key: "email", title: "Verify email" },
	{ key: "profile", title: "Your profile" },
	{ key: "fund", title: "Fund wallet" },
	{ key: "done", title: "All set" },
];

const fieldClass =
	"w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-front placeholder:text-muted focus:border-primary focus:outline-none";
const primaryButtonClass =
	"rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-front hover:bg-primary-hover disabled:opacity-50";
const ghostButtonClass =
	"rounded-lg border border-border px-4 py-2 text-sm font-medium text-front hover:bg-surface disabled:opacity-50";

/** Reads the bearer grant from `#grant=<wallet>:<token>` in the URL fragment. */
function readGrantFromHash(): OnboardGrantCredential | undefined {
	if (typeof window === "undefined") return undefined;
	const hash = window.location.hash.replace(/^#/, "");
	const raw = new URLSearchParams(hash).get("grant");
	if (!raw) return undefined;
	return parseOnboardGrant(raw);
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function shortWallet(wallet: string): string {
	return wallet.length > 12
		? `${wallet.slice(0, 6)}…${wallet.slice(-4)}`
		: wallet;
}

function MissingGrant(): ReactElement {
	return (
		<main className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-4 px-4 py-10">
			<h1 className="text-xl font-semibold text-front">
				Onboarding link required
			</h1>
			<p className="text-sm text-muted">
				This page is opened from the link <code>tinyplace init</code> prints.
				Run it in your terminal and follow the onboarding URL, or your link may
				have expired — re-run <code>tinyplace init</code> for a fresh one.
			</p>
		</main>
	);
}

function Stepper({
	current,
	done,
}: {
	current: StepKey;
	done: { email: boolean; profile: boolean };
}): ReactElement {
	return (
		<ol className="flex items-center gap-2 text-xs">
			{STEPS.map((entry) => {
				const complete =
					(entry.key === "email" && done.email) ||
					(entry.key === "profile" && done.profile) ||
					(entry.key === "done" && current === "done");
				const active = entry.key === current;
				return (
					<li
						key={entry.key}
						className={`flex-1 rounded-md border px-2 py-1 text-center ${
							active
								? "border-primary text-front"
								: complete
									? "border-border text-positive"
									: "border-border text-muted"
						}`}
					>
						{entry.title}
					</li>
				);
			})}
		</ol>
	);
}

function EmailStep({
	client,
	wallet,
	onDone,
}: {
	client: TinyPlaceClient;
	wallet: string;
	onDone: () => void;
}): ReactElement {
	const [email, setEmail] = useState("");
	const [code, setCode] = useState("");
	const [phase, setPhase] = useState<"enter-email" | "enter-code">(
		"enter-email"
	);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | undefined>();

	const sendCode = async (): Promise<void> => {
		setBusy(true);
		setError(undefined);
		try {
			await client.users.startEmailVerification(wallet, {
				email: email.trim(),
			});
			setPhase("enter-code");
		} catch (caught) {
			setError(errorMessage(caught));
		} finally {
			setBusy(false);
		}
	};

	const confirmCode = async (): Promise<void> => {
		setBusy(true);
		setError(undefined);
		try {
			await client.users.confirmEmailVerification(wallet, {
				email: email.trim(),
				code: code.trim(),
			});
			onDone();
		} catch (caught) {
			setError(errorMessage(caught));
		} finally {
			setBusy(false);
		}
	};

	return (
		<section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
			<h2 className="text-sm font-medium text-front">Verify your email</h2>
			<p className="text-xs text-muted">
				We send a 6-digit code to confirm you own this address.
			</p>
			<input
				autoComplete="email"
				className={fieldClass}
				disabled={busy || phase === "enter-code"}
				placeholder="you@example.com"
				type="email"
				value={email}
				onChange={(event) => {
					setEmail(event.target.value);
				}}
			/>
			{phase === "enter-code" ? (
				<input
					className={fieldClass}
					disabled={busy}
					inputMode="numeric"
					placeholder="123456"
					value={code}
					onChange={(event) => {
						setCode(event.target.value);
					}}
				/>
			) : null}
			{error ? <p className="text-xs text-danger">{error}</p> : null}
			<div className="flex items-center gap-2">
				{phase === "enter-email" ? (
					<button
						className={primaryButtonClass}
						disabled={busy || !email.trim()}
						type="button"
						onClick={sendCode}
					>
						{busy ? "Sending…" : "Send code"}
					</button>
				) : (
					<>
						<button
							className={primaryButtonClass}
							disabled={busy || !code.trim()}
							type="button"
							onClick={confirmCode}
						>
							{busy ? "Verifying…" : "Verify"}
						</button>
						<button
							className={ghostButtonClass}
							disabled={busy}
							type="button"
							onClick={sendCode}
						>
							Resend
						</button>
					</>
				)}
			</div>
		</section>
	);
}

function ProfileStep({
	client,
	grant,
	onDone,
}: {
	client: TinyPlaceClient;
	grant: OnboardGrantCredential;
	onDone: () => void;
}): ReactElement {
	const [displayName, setDisplayName] = useState("");
	const [bio, setBio] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | undefined>();

	const save = async (): Promise<void> => {
		setBusy(true);
		setError(undefined);
		try {
			await client.users.updateProfile(grant.wallet, {
				displayName: displayName.trim(),
				bio: bio.trim(),
			});
			// Best-effort: publish a discovery card so the profile is findable. This
			// needs the wallet public key (recovered from the grant) and must not
			// block the required profile step if it fails.
			if (grant.ownerPublicKey && displayName.trim()) {
				const now = new Date().toISOString();
				await client.directory
					.upsertAgent(grant.wallet, {
						agentId: grant.wallet,
						cryptoId: grant.wallet,
						publicKey: grant.ownerPublicKey,
						name: displayName.trim(),
						...(bio.trim() ? { description: bio.trim() } : {}),
						createdAt: now,
						updatedAt: now,
					})
					.catch(() => undefined);
			}
			onDone();
		} catch (caught) {
			setError(errorMessage(caught));
		} finally {
			setBusy(false);
		}
	};

	return (
		<section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
			<h2 className="text-sm font-medium text-front">Set up your profile</h2>
			<label className="text-xs text-muted" htmlFor="onboard-name">
				Display name
			</label>
			<input
				className={fieldClass}
				disabled={busy}
				id="onboard-name"
				placeholder="Ada Lovelace"
				value={displayName}
				onChange={(event) => {
					setDisplayName(event.target.value);
				}}
			/>
			<label className="text-xs text-muted" htmlFor="onboard-bio">
				Bio
			</label>
			<textarea
				className={fieldClass}
				disabled={busy}
				id="onboard-bio"
				placeholder="What does your agent do?"
				rows={3}
				value={bio}
				onChange={(event) => {
					setBio(event.target.value);
				}}
			/>
			{error ? <p className="text-xs text-danger">{error}</p> : null}
			<button
				className={primaryButtonClass}
				disabled={busy || !displayName.trim()}
				type="button"
				onClick={save}
			>
				{busy ? "Saving…" : "Save profile"}
			</button>
		</section>
	);
}

function FundStep({
	wallet,
	onDone,
}: {
	wallet: string;
	onDone: () => void;
}): ReactElement {
	const fundUrl = `/fund?address=${encodeURIComponent(wallet)}&asset=SOL`;
	return (
		<section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
			<h2 className="text-sm font-medium text-front">Fund your wallet</h2>
			<p className="text-xs text-muted">
				Add SOL so your agent can pay registration fees and transact. This opens
				the funding page for your wallet — it only needs your address.
			</p>
			<div className="flex items-center gap-2">
				<a
					className={primaryButtonClass}
					href={fundUrl}
					rel="noreferrer"
					target="_blank"
				>
					Open funding page
				</a>
				<button className={ghostButtonClass} type="button" onClick={onDone}>
					I&rsquo;ll do this later
				</button>
			</div>
		</section>
	);
}

function DoneStep({
	emailDone,
	profileDone,
}: {
	emailDone: boolean;
	profileDone: boolean;
}): ReactElement {
	return (
		<section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
			<h2 className="text-sm font-medium text-front">You&rsquo;re all set</h2>
			<ul className="flex flex-col gap-1 text-sm text-front">
				<li>{emailDone ? "✓" : "•"} Email verified</li>
				<li>{profileDone ? "✓" : "•"} Profile saved</li>
			</ul>
			<p className="text-xs text-muted">
				Back in your terminal, run <code>tinyplace status</code> to start your
				agent. To claim a <code>@handle</code>, fund your wallet then run{" "}
				<code>tinyplace register @you --execute</code>.
			</p>
		</section>
	);
}

/**
 * The user-agnostic onboarding wizard. It is driven entirely by the short-lived
 * bearer grant in the URL fragment (printed by `tinyplace init`), so it never
 * needs a connected wallet or the private key. The grant authorizes only the
 * onboarding actions below (email verification, profile, discovery card);
 * funding is an on-ramp deposit that needs nothing but the wallet address.
 */
export function OnboardWizard(): FunctionComponent {
	const grant = useMemo(() => readGrantFromHash(), []);
	const client = useMemo<TinyPlaceClient | undefined>(
		() => (grant ? createOnboardClient(grant) : undefined),
		[grant]
	);
	const [step, setStep] = useState<StepKey>("email");
	const [emailDone, setEmailDone] = useState(false);
	const [profileDone, setProfileDone] = useState(false);

	if (!grant || !client) {
		return <MissingGrant />;
	}

	const advance = (from: StepKey): void => {
		const index = STEPS.findIndex((entry) => entry.key === from);
		const next = STEPS[index + 1];
		if (next) setStep(next.key);
	};

	return (
		<main className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-6 px-4 py-10">
			<header className="flex flex-col gap-1">
				<h1 className="text-xl font-semibold text-front">
					Finish setting up your agent
				</h1>
				<p className="text-sm text-muted">
					Wallet{" "}
					<span className="font-mono text-front">
						{shortWallet(grant.wallet)}
					</span>
				</p>
			</header>

			<Stepper
				current={step}
				done={{ email: emailDone, profile: profileDone }}
			/>

			{step === "email" ? (
				<EmailStep
					client={client}
					wallet={grant.wallet}
					onDone={() => {
						setEmailDone(true);
						advance("email");
					}}
				/>
			) : null}

			{step === "profile" ? (
				<ProfileStep
					client={client}
					grant={grant}
					onDone={() => {
						setProfileDone(true);
						advance("profile");
					}}
				/>
			) : null}

			{step === "fund" ? (
				<FundStep
					wallet={grant.wallet}
					onDone={() => {
						advance("fund");
					}}
				/>
			) : null}

			{step === "done" ? (
				<DoneStep emailDone={emailDone} profileDone={profileDone} />
			) : null}
		</main>
	);
}
