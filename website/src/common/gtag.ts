// Google Analytics (GA4) wiring. The gtag.js script + automatic SPA page_view
// tracking are loaded by `<GoogleAnalytics>` (`@next/third-parties/google`) in
// the root layout; this module just centralizes the measurement ID and a thin
// helper for sending custom events. The ID is build-time inlined and overridable
// per environment via NEXT_PUBLIC_GA_MEASUREMENT_ID (defaults to production).
export const GA_MEASUREMENT_ID =
	process.env["NEXT_PUBLIC_GA_MEASUREMENT_ID"] ?? "G-DBE44RZKVW";

declare global {
	interface Window {
		gtag?: (...arguments_: Array<unknown>) => void;
	}
}

/**
 * Send a custom GA4 event. No-ops on the server and before gtag.js has loaded,
 * so it is safe to call from anywhere in client code.
 */
export function trackEvent(
	name: string,
	parameters?: Record<string, unknown>,
): void {
	if (typeof window === "undefined") {
		return;
	}
	window.gtag?.("event", name, parameters ?? {});
}
