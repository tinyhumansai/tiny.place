"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactElement } from "react";
import { Trans, useTranslation } from "react-i18next";
import {
	parseOnboardGrant,
	type Identity,
	type OnboardGrantCredential,
	type TinyPlaceClient,
	type User,
} from "@tinyhumansai/tinyplace";

import { createClient, createOnboardClient } from "@src/common/api-client";
import type { FunctionComponent } from "@src/common/types";

type StepKey = "email" | "profile" | "handle" | "fund" | "done";

type Step = { key: StepKey; titleKey: string };

// Fund the wallet before claiming an identity: registration is a paid x402 flow,
// so the wallet needs a balance first.
const STEPS: Array<Step> = [
	{ key: "email", titleKey: "onboard.stepEmail" },
	{ key: "profile", titleKey: "onboard.stepProfile" },
	{ key: "fund", titleKey: "onboard.stepWallet" },
	{ key: "handle", titleKey: "onboard.stepIdentity" },
	{ key: "done", titleKey: "onboard.stepDone" },
];

const WEB_STEPS: Array<Step> = STEPS;

const fieldClass =
	"w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-front placeholder:text-muted focus:border-primary focus:outline-none";
const primaryButtonClass =
	"rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-front hover:bg-primary-hover disabled:opacity-50";
const ghostButtonClass =
	"rounded-lg border border-border px-4 py-2 text-sm font-medium text-front hover:bg-surface disabled:opacity-50";

/**
 * Reads the raw `#grant=…` fragment value. It is either the whole bearer grant
 * (`<wallet>:og1.…`) or a short handoff token minted by `tinyplace init`; the
 * caller decides which by trying to parse it as a grant first.
 */
function readHandoffFromHash(): string | undefined {
	if (typeof window === "undefined") return undefined;
	const hash = window.location.hash.replace(/^#/, "");
	return new URLSearchParams(hash).get("grant") ?? undefined;
}

type GrantResolution =
	| { status: "loading" }
	| { status: "ready"; grant: OnboardGrantCredential }
	| { status: "missing" };

/**
 * Resolves the onboarding grant from the URL fragment. The fragment carries
 * either the whole grant (used as-is) or a short handoff token, which we exchange
 * server-side (public POST /onboard/handoff/redeem) for the grant. The redeemed
 * grant is held in memory; a reload re-redeems while the token still lives.
 */
function useOnboardGrant(): GrantResolution {
	const raw = useMemo(() => readHandoffFromHash(), []);
	const direct = useMemo(
		() => (raw ? parseOnboardGrant(raw) : undefined),
		[raw]
	);
	const [redeemed, setRedeemed] = useState<
		OnboardGrantCredential | undefined
	>();
	const [redeeming, setRedeeming] = useState(Boolean(raw) && !direct);

	useEffect(() => {
		// `redeeming` already starts true in exactly this case (a token, not a
		// parseable grant), so the effect only has to clear it when the exchange
		// settles — no synchronous setState on entry.
		if (!raw || direct) return undefined;
		let active = true;
		createClient()
			.onboard.redeemHandoff(raw)
			.then((result): void => {
				if (active) setRedeemed(parseOnboardGrant(result.grant));
			})
			.catch((): void => {
				// An unknown/expired token resolves to the MissingGrant prompt below.
			})
			.finally((): void => {
				if (active) setRedeeming(false);
			});
		return (): void => {
			active = false;
		};
	}, [raw, direct]);

	if (direct) return { status: "ready", grant: direct };
	if (redeemed) return { status: "ready", grant: redeemed };
	if (redeeming) return { status: "loading" };
	return { status: "missing" };
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function shortWallet(wallet: string): string {
	return wallet.length > 12
		? `${wallet.slice(0, 6)}…${wallet.slice(-4)}`
		: wallet;
}

function ResolvingGrant(): ReactElement {
	const { t } = useTranslation();
	return (
		<main className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-4 px-4 py-10">
			<h1 className="text-xl font-semibold text-front">
				{t("onboard.resolvingTitle")}
			</h1>
			<p className="text-sm text-muted">{t("onboard.resolvingSubtitle")}</p>
		</main>
	);
}

function MissingGrant(): ReactElement {
	const { t } = useTranslation();
	return (
		<main className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-4 px-4 py-10">
			<h1 className="text-xl font-semibold text-front">
				{t("onboard.missingGrantTitle")}
			</h1>
			<p className="text-sm text-muted">
				<Trans
					components={{ code: <code /> }}
					i18nKey="onboard.missingGrantBody"
				/>
			</p>
		</main>
	);
}

function Stepper({
	current,
	done,
	onSelect,
	steps,
}: {
	current: StepKey;
	done: Partial<Record<StepKey, boolean>>;
	/** Jump to any step — the stepper is freely navigable back and forth. */
	onSelect: (key: StepKey) => void;
	steps: Array<Step>;
}): ReactElement {
	const { t } = useTranslation();
	return (
		<ol className="flex items-center gap-2 text-xs">
			{steps.map((entry) => {
				const complete =
					entry.key === "done" ? current === "done" : Boolean(done[entry.key]);
				const active = entry.key === current;
				return (
					<li key={entry.key} className="flex-1">
						<button
							aria-current={active ? "step" : undefined}
							type="button"
							className={`w-full rounded-md border px-2 py-1 text-center transition-colors ${
								active
									? "border-primary bg-primary text-primary-front"
									: complete
										? "border-border bg-surface text-positive hover:bg-bg"
										: "border-border bg-surface text-muted hover:bg-bg"
							}`}
							onClick={() => {
								onSelect(entry.key);
							}}
						>
							{t(entry.titleKey, { defaultValue: entry.titleKey })}
						</button>
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
	const { t } = useTranslation();
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
			<h2 className="text-sm font-medium text-front">
				{t("onboard.emailTitle")}
			</h2>
			<p className="text-xs text-muted">{t("onboard.emailSubtitle")}</p>
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
				<>
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
					<p className="text-xs text-muted">{t("onboard.emailResendHint")}</p>
				</>
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
						{busy ? t("onboard.emailSending") : t("onboard.emailSendCode")}
					</button>
				) : (
					<>
						<button
							className={primaryButtonClass}
							disabled={busy || !code.trim()}
							type="button"
							onClick={confirmCode}
						>
							{busy ? t("onboard.emailVerifying") : t("onboard.emailVerify")}
						</button>
						<button
							className={ghostButtonClass}
							disabled={busy}
							type="button"
							onClick={sendCode}
						>
							{t("onboard.emailResend")}
						</button>
					</>
				)}
			</div>
		</section>
	);
}

function ProfileStep({
	client,
	ownerPublicKey,
	wallet,
	onDone,
}: {
	client: TinyPlaceClient;
	ownerPublicKey?: string;
	wallet: string;
	onDone: () => void;
}): ReactElement {
	const { t } = useTranslation();
	const [displayName, setDisplayName] = useState("");
	const [bio, setBio] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | undefined>();

	const save = async (): Promise<void> => {
		setBusy(true);
		setError(undefined);
		try {
			await client.users.updateProfile(wallet, {
				displayName: displayName.trim(),
				bio: bio.trim(),
				actorType: "human",
			});
			// Best-effort: publish a discovery card so the profile is findable. This
			// needs the wallet public key (recovered from the grant) and must not
			// block the required profile step if it fails.
			if (ownerPublicKey && displayName.trim()) {
				const now = new Date().toISOString();
				await client.directory
					.upsertAgent(wallet, {
						agentId: wallet,
						cryptoId: wallet,
						publicKey: ownerPublicKey,
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
			<h2 className="text-sm font-medium text-front">
				{t("onboard.profileTitle")}
			</h2>
			<label className="text-xs text-muted" htmlFor="onboard-name">
				{t("onboard.profileDisplayName")}
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
				{t("onboard.profileBio")}
			</label>
			<textarea
				className={fieldClass}
				disabled={busy}
				id="onboard-bio"
				placeholder={t("onboard.profileBioPlaceholder")}
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
				{busy ? t("common.saving") : t("onboard.profileSave")}
			</button>
		</section>
	);
}

function HandleStep({
	active,
	onDone,
}: {
	active: boolean;
	onDone: () => void;
}): ReactElement {
	const { t } = useTranslation();
	return (
		<section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
			<h2 className="text-sm font-medium text-front">
				{t("onboard.handleTitle")}
			</h2>
			<p className="text-xs text-muted">{t("onboard.handleSubtitle")}</p>
			{active ? (
				<p className="text-xs text-positive">{t("onboard.handleActive")}</p>
			) : (
				<div className="flex items-center gap-2">
					<Link className={primaryButtonClass} href="/identities">
						{t("onboard.handleClaim")}
					</Link>
					<button className={ghostButtonClass} type="button" onClick={onDone}>
						{t("onboard.doLater")}
					</button>
				</div>
			)}
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
	const { t } = useTranslation();
	const fundUrl = `/fund?address=${encodeURIComponent(wallet)}&asset=SOL`;
	return (
		<section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
			<h2 className="text-sm font-medium text-front">
				{t("onboard.fundTitle")}
			</h2>
			<p className="text-xs text-muted">{t("onboard.fundSubtitle")}</p>
			<div className="flex items-center gap-2">
				<a
					className={primaryButtonClass}
					href={fundUrl}
					rel="noreferrer"
					target="_blank"
				>
					{t("onboard.fundOpen")}
				</a>
				<button className={ghostButtonClass} type="button" onClick={onDone}>
					{t("onboard.doLater")}
				</button>
			</div>
		</section>
	);
}

function DoneStep({
	emailDone,
	handleDone,
	profileDone,
	twitterDone,
	onComplete,
}: {
	emailDone: boolean;
	handleDone: boolean;
	profileDone: boolean;
	/** Omitted by the CLI wizard (no X step); set by the web wizard. */
	twitterDone?: boolean;
	/** Finalizes onboarding and drops the user back into tiny.place. */
	onComplete: () => void;
}): ReactElement {
	const { t } = useTranslation();
	const statusLabel = (complete: boolean): string =>
		complete ? t("onboard.statusComplete") : t("onboard.statusSkipped");
	return (
		<section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
			<h2 className="text-sm font-medium text-front">
				{t("onboard.doneTitle")}
			</h2>
			<ul className="flex flex-col gap-1 text-sm text-front">
				<li>{t("onboard.doneEmail", { status: statusLabel(emailDone) })}</li>
				<li>
					{t("onboard.doneProfile", { status: statusLabel(profileDone) })}
				</li>
				<li>{t("onboard.doneHandle", { status: statusLabel(handleDone) })}</li>
				{twitterDone !== undefined ? (
					<li>
						{t("onboard.doneTwitter", { status: statusLabel(twitterDone) })}
					</li>
				) : null}
			</ul>
			<p className="text-xs text-muted">{t("onboard.doneHint")}</p>
			<button className={primaryButtonClass} type="button" onClick={onComplete}>
				{t("onboard.doneComplete")}
			</button>
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
	const { t } = useTranslation();
	const resolution = useOnboardGrant();
	const grant = resolution.status === "ready" ? resolution.grant : undefined;
	const client = useMemo<TinyPlaceClient | undefined>(
		() => (grant ? createOnboardClient(grant) : undefined),
		[grant]
	);
	const router = useRouter();
	const [step, setStep] = useState<StepKey>("email");
	const [emailDone, setEmailDone] = useState(false);
	const [profileDone, setProfileDone] = useState(false);
	const handleDone = false;

	if (resolution.status === "loading") {
		return <ResolvingGrant />;
	}
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
					{t("onboard.wizardAgentTitle")}
				</h1>
				<p className="text-sm text-muted">
					{t("onboard.walletLabel")}{" "}
					<span className="font-mono text-front">
						{shortWallet(grant.wallet)}
					</span>
				</p>
			</header>

			<Stepper
				current={step}
				steps={STEPS}
				done={{
					email: emailDone,
					handle: handleDone,
					profile: profileDone,
				}}
				onSelect={setStep}
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
					ownerPublicKey={grant.ownerPublicKey}
					wallet={grant.wallet}
					onDone={() => {
						setProfileDone(true);
						advance("profile");
					}}
				/>
			) : null}

			{step === "handle" ? (
				<HandleStep
					active={handleDone}
					onDone={() => {
						advance("handle");
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
				<DoneStep
					emailDone={emailDone}
					handleDone={handleDone}
					profileDone={profileDone}
					onComplete={() => {
						router.push("/");
					}}
				/>
			) : null}
		</main>
	);
}

type WebOnboardWizardProperties = {
	activeIdentities?: Array<Identity>;
	client: TinyPlaceClient;
	user?: User | null;
	wallet: string;
};

function hasProfile(user: User | null | undefined): boolean {
	return Boolean(user?.displayName?.trim());
}

function hasVerifiedEmail(user: User | null | undefined): boolean {
	return Boolean(user?.emailVerified);
}

function hasActiveIdentity(identities: Array<Identity> | undefined): boolean {
	return Boolean(identities?.some((identity) => identity.status === "active"));
}

function firstIncompleteStep({
	activeIdentities,
	user,
}: Pick<WebOnboardWizardProperties, "activeIdentities" | "user">): StepKey {
	if (!hasVerifiedEmail(user)) {
		return "email";
	}
	if (!hasProfile(user)) {
		return "profile";
	}
	if (!hasActiveIdentity(activeIdentities)) {
		return "handle";
	}
	return "done";
}

export function WebOnboardWizard({
	activeIdentities,
	client,
	user,
	wallet,
}: WebOnboardWizardProperties): FunctionComponent {
	const { t } = useTranslation();
	const router = useRouter();
	const searchParameters = useSearchParams();
	// Where the onboarding gate sent the user from; return there on completion,
	// guarding against bouncing back into onboarding. Falls back to the home feed.
	const returnTo = searchParameters.get("returnTo");
	const completeHref =
		returnTo && !returnTo.startsWith("/onboard") ? returnTo : "/";
	const [step, setStep] = useState<StepKey>(() =>
		firstIncompleteStep({ activeIdentities, user })
	);
	const [emailCompleted, setEmailCompleted] = useState(false);
	const [profileCompleted, setProfileCompleted] = useState(false);
	const emailDone = hasVerifiedEmail(user) || emailCompleted;
	const profileDone = hasProfile(user) || profileCompleted;
	const handleDone = hasActiveIdentity(activeIdentities);

	const advance = (from: StepKey): void => {
		const index = WEB_STEPS.findIndex((entry) => entry.key === from);
		const remaining = WEB_STEPS.slice(index + 1);
		const next =
			remaining.find((entry) => {
				if (entry.key === "email") return !emailDone;
				if (entry.key === "profile") return !profileDone;
				if (entry.key === "handle") return !handleDone;
				return true;
			}) ?? WEB_STEPS[WEB_STEPS.length - 1];
		setStep(next?.key ?? "done");
	};

	return (
		<main className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-6 px-4 py-10">
			<header className="flex flex-col gap-1">
				<h1 className="text-xl font-semibold text-front">
					{t("onboard.wizardAccountTitle")}
				</h1>
				<p className="text-sm text-muted">
					{t("onboard.walletLabel")}{" "}
					<span className="font-mono text-front">{shortWallet(wallet)}</span>
				</p>
			</header>

			<Stepper
				current={step}
				steps={WEB_STEPS}
				done={{
					email: emailDone,
					handle: handleDone,
					profile: profileDone,
				}}
				onSelect={setStep}
			/>

			{step === "email" ? (
				<EmailStep
					client={client}
					wallet={wallet}
					onDone={() => {
						setEmailCompleted(true);
						advance("email");
					}}
				/>
			) : null}

			{step === "profile" ? (
				<ProfileStep
					client={client}
					wallet={wallet}
					onDone={() => {
						setProfileCompleted(true);
						advance("profile");
					}}
				/>
			) : null}

			{step === "handle" ? (
				<HandleStep
					active={handleDone}
					onDone={() => {
						advance("handle");
					}}
				/>
			) : null}

			{step === "fund" ? (
				<FundStep
					wallet={wallet}
					onDone={() => {
						advance("fund");
					}}
				/>
			) : null}

			{step === "done" ? (
				<DoneStep
					emailDone={emailDone}
					handleDone={handleDone}
					profileDone={profileDone}
					onComplete={() => {
						router.push(completeHref);
					}}
				/>
			) : null}
		</main>
	);
}
