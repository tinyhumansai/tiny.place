"use client";

import { useEffect } from "react";
import { trackEvent } from "@src/common/analytics";

/** Longest button label we forward to GA; keeps event cardinality sane. */
const MAX_LABEL_LENGTH = 80;

function labelFor(element: HTMLElement): string {
	const analyticsId = element.dataset["analyticsId"];
	if (analyticsId) {
		return analyticsId;
	}
	const ariaLabel = element.getAttribute("aria-label");
	if (ariaLabel) {
		return ariaLabel.trim().slice(0, MAX_LABEL_LENGTH);
	}
	const text = element.textContent?.trim();
	if (text) {
		return text.slice(0, MAX_LABEL_LENGTH);
	}
	return element.tagName.toLowerCase();
}

/**
 * App-wide click instrumentation. A single capture-phase listener on the
 * document forwards every click that lands on a button (or `role="button"`) to
 * Google Analytics as a `button_click` event, so every existing and future
 * button is tracked without each call site wiring gtag. Pairs with the shared
 * `<Button>` component, which sets `data-analytics-id` for richer labels.
 */
export function AnalyticsClickTracker(): null {
	useEffect(() => {
		function handleClick(event: MouseEvent): void {
			const target = event.target;
			if (!(target instanceof Element)) {
				return;
			}
			const element = target.closest<HTMLElement>(
				"button, [role='button']",
			);
			if (!element) {
				return;
			}
			trackEvent("button_click", {
				label: labelFor(element),
				// eslint-disable-next-line camelcase
				page_path: window.location.pathname,
			});
		}
		document.addEventListener("click", handleClick, { capture: true });
		return (): void => {
			document.removeEventListener("click", handleClick, { capture: true });
		};
	}, []);
	return null;
}
