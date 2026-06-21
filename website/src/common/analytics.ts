// Single source of truth for client-side analytics. Provider scripts (gtag.js
// for Google Analytics, op1.js for OpenPanel) are mounted by
// `src/components/analytics/Analytics.tsx`; this module owns the configuration
// IDs and a unified `trackEvent` that fans a single custom event out to every
// configured provider, so call sites never talk to a vendor SDK directly.
//
// All IDs are build-time inlined and overridable per environment via the
// matching NEXT_PUBLIC_* vars (see website/.env).

export const GA_MEASUREMENT_ID =
	process.env["NEXT_PUBLIC_GA_MEASUREMENT_ID"] ?? "G-DBE44RZKVW";

export const OPENPANEL_CLIENT_ID =
	process.env["NEXT_PUBLIC_OPENPANEL_CLIENT_ID"] ??
	"04fb56d0-dbba-4d47-9406-9342cccb454a";

export const OPENPANEL_API_URL =
	process.env["NEXT_PUBLIC_OPENPANEL_API_URL"] ??
	"https://panel.tinyhumans.ai/api";

declare global {
	interface Window {
		gtag?: (...arguments_: Array<unknown>) => void;
		// `op` is declared (and required) by @openpanel/web's global types, so we
		// don't re-declare it here; it is accessed via a local cast in trackEvent.
	}
}

type OpenPanelCall = (...arguments_: Array<unknown>) => void;

/**
 * Send a custom analytics event to every configured provider (Google Analytics
 * + OpenPanel). No-ops on the server and before the provider scripts have
 * loaded (each vendor queues or drops the call), so it is safe to call from
 * anywhere in client code.
 */
export function trackEvent(
	name: string,
	properties?: Record<string, unknown>,
): void {
	if (typeof window === "undefined") {
		return;
	}
	window.gtag?.("event", name, properties ?? {});
	const op = (window as unknown as { op?: OpenPanelCall }).op;
	op?.("track", name, properties ?? {});
}
