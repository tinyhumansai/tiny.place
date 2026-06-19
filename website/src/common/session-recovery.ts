// A tiny registry that bridges the SDK's transport-level "auth invalidated"
// signal (a 401/403 from any request) to the wallet layer that can actually
// re-establish a session. `WalletAuthSync` registers the handler while a wallet
// is connected; the API client invokes `notifySessionInvalid` on a 401/403.
//
// Kept outside React so the SDK client (plain TS) can reach it without a hook.

export type SessionInvalidReason = {
	forceResign?: boolean;
};

type SessionInvalidHandler = (reason?: SessionInvalidReason) => void;

let handler: SessionInvalidHandler | undefined;

/** Registers (or clears, with undefined) the session-recovery handler. */
export function setSessionInvalidHandler(
	next: SessionInvalidHandler | undefined
): void {
	handler = next;
}

/** Signals that the current session was rejected and should be re-established. */
export function notifySessionInvalid(reason?: SessionInvalidReason): void {
	handler?.(reason);
}
