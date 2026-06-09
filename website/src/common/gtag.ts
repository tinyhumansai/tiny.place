const GA_MEASUREMENT_ID = "G-DBE44RZKVW";

declare global {
	interface Window {
		gtag?: (...arguments_: Array<unknown>) => void;
	}
}

export function trackPageView(url: string): void {
	// eslint-disable-next-line camelcase
	window.gtag?.("config", GA_MEASUREMENT_ID, { page_path: url });
}
