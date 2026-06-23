import type {
	SubscriptionPlan,
	X402AuthorizationFields,
} from "@tinyhumansai/tinyplace";

/**
 * Grace window added on top of an interval before a subscription
 * authorization mandate expires. Gives renewals room to settle while still
 * bounding how long a signed "upto" debit mandate stays valid.
 */
const SUBSCRIPTION_AUTHORIZATION_GRACE_MS = 24 * 60 * 60 * 1000;

/**
 * Fallback bound used when the plan interval is missing or unrecognized.
 * Subscription mandates must NEVER be signed without an expiry, so this
 * guarantees a finite ceiling even for unknown interval strings.
 */
const SUBSCRIPTION_AUTHORIZATION_FALLBACK_MS = 32 * 24 * 60 * 60 * 1000;

const INTERVAL_DURATIONS_MS: Record<string, number> = {
	daily: 24 * 60 * 60 * 1000,
	day: 24 * 60 * 60 * 1000,
	weekly: 7 * 24 * 60 * 60 * 1000,
	week: 7 * 24 * 60 * 60 * 1000,
	monthly: 31 * 24 * 60 * 60 * 1000,
	month: 31 * 24 * 60 * 60 * 1000,
	quarterly: 92 * 24 * 60 * 60 * 1000,
	yearly: 366 * 24 * 60 * 60 * 1000,
	year: 366 * 24 * 60 * 60 * 1000,
	annual: 366 * 24 * 60 * 60 * 1000,
};

function intervalDurationMs(interval: string): number {
	const normalized = interval.trim().toLowerCase();
	return (
		INTERVAL_DURATIONS_MS[normalized] ?? SUBSCRIPTION_AUTHORIZATION_FALLBACK_MS
	);
}

/**
 * Computes a bounded, future expiry for a subscription authorization mandate:
 * now + (one interval) + a grace window. Subscription authorizations must
 * always carry a non-empty, time-limited `expiresAt` so the signed mandate
 * cannot become a perpetual debit authorization.
 */
export function subscriptionAuthorizationExpiresAt(
	interval: string,
	now: number = Date.now()
): string {
	const durationMs =
		intervalDurationMs(interval) + SUBSCRIPTION_AUTHORIZATION_GRACE_MS;
	return new Date(now + durationMs).toISOString();
}

/**
 * Builds the canonical x402 authorization fields for a subscription mandate
 * with a bounded `expiresAt`. Extracted into a hook-free module so the expiry
 * bound is unit-testable without resolving the `@src/*` alias graph.
 */
export function buildSubscriptionAuthorizationFields(input: {
	subscriptionId: string;
	plan: SubscriptionPlan;
	from: string;
	to: string;
	now?: number;
}): X402AuthorizationFields {
	return {
		scheme: "exact",
		network: input.plan.network,
		asset: input.plan.asset,
		amount: input.plan.amount,
		from: input.from,
		to: input.to,
		nonce: `subscription:${input.subscriptionId}:authorization`,
		expiresAt: subscriptionAuthorizationExpiresAt(
			input.plan.interval,
			input.now
		),
		metadata: {
			domain: "tiny.place",
			subscriptionId: input.subscriptionId,
			kind: "subscription_authorization",
			interval: input.plan.interval,
		},
	};
}
