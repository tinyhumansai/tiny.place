import { useTranslation } from "react-i18next";

import { useTinyplaceWallet } from "@src/common/tinyplace-wallet";
import { useAuthStore } from "@src/store/auth";

/**
 * Empty-state message for a signed-write surface.
 *
 * The write gate keys on `agentId`, which is only set once the browser-session
 * approval completes — not when the wallet first connects. Telling a user with a
 * connected wallet to "connect your wallet" is misleading, so this distinguishes
 * the two states:
 *
 * - no wallet connected → "Connect your wallet to {action}."
 * - wallet connected, session not yet approved → "Approve the sign-in request to
 *   {action}." (the approval dialog auto-opens on connect; this nudges the user
 *   who hasn't completed it).
 *
 * Returns `undefined` once authenticated (`agentId` set), so the caller can
 * render its normal "acting as …" state. `action` is the already-translated
 * lowercase verb phrase, e.g. `t("writeGate.actions.createAndRsvpEvents")`.
 */
export function useWriteGateMessage(action: string): string | undefined {
	const { t } = useTranslation();
	const agentId = useAuthStore((state) => state.agentId);
	const connected = useTinyplaceWallet().connected;
	if (agentId) {
		return undefined;
	}
	return connected
		? t("writeGate.approve", { action })
		: t("writeGate.connect", { action });
}
