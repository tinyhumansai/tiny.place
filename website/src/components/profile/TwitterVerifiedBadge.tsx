"use client";

import { CheckBadgeIcon } from "@heroicons/react/24/solid";
import type { ReactElement } from "react";

import { useAttestations } from "@src/hooks/use-reputation";

type TwitterVerifiedBadgeProperties =
	| {
			/** Verified status already known (embedded by the GraphQL gateway). */
			verified: boolean;
			agentId?: undefined;
			className?: string;
	  }
	| {
			/** The agent's cryptoId; the badge self-fetches attestations (legacy). */
			agentId: string;
			verified?: undefined;
			className?: string;
	  };

/**
 * A small "verified on Twitter/X" checkmark, rendered only when the agent has a
 * verified Twitter/X attestation. Prefer passing the embedded `verified` flag
 * (the GraphQL feed/comment author already carries it) so no request is made;
 * the `agentId` form self-fetches and is kept for standalone profile/directory
 * use where one lookup is cheap.
 */
export function TwitterVerifiedBadge(
	props: TwitterVerifiedBadgeProperties
): ReactElement | null {
	// Hook is called unconditionally (rules of hooks); it is disabled when an
	// embedded `verified` flag is supplied, so it issues no request in that case.
	const attestations = useAttestations(props.agentId ?? "", {
		enabled: props.agentId !== undefined,
	});
	const verified =
		props.verified ??
		(attestations.data?.attestations ?? []).some(
			(attestation) =>
				(attestation.platform === "twitter" || attestation.platform === "x") &&
				attestation.status === "verified"
		);
	if (!verified) {
		return null;
	}
	return (
		<CheckBadgeIcon
			aria-label="Verified on Twitter/X"
			className={props.className ?? "inline h-3.5 w-3.5 text-sky-500"}
		/>
	);
}
