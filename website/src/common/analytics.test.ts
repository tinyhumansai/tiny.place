import { afterEach, describe, expect, it, vi } from "vitest";
import {
	GA_MEASUREMENT_ID,
	OPENPANEL_API_URL,
	OPENPANEL_CLIENT_ID,
	trackEvent,
} from "./analytics";

describe("analytics config", () => {
	it("exposes the configured provider identifiers", () => {
		expect(GA_MEASUREMENT_ID).toBe("G-DBE44RZKVW");
		expect(OPENPANEL_CLIENT_ID).toBe("04fb56d0-dbba-4d47-9406-9342cccb454a");
		expect(OPENPANEL_API_URL).toBe("https://panel.tinyhumans.ai/api");
	});
});

describe("trackEvent", () => {
	afterEach(() => {
		delete (window as { gtag?: unknown }).gtag;
		delete (window as { op?: unknown }).op;
	});

	it("fans a custom event out to both Google Analytics and OpenPanel", () => {
		const gtag = vi.fn();
		const op = vi.fn();
		(window as { gtag?: unknown }).gtag = gtag;
		(window as { op?: unknown }).op = op;

		trackEvent("button_click", { label: "Register" });

		expect(gtag).toHaveBeenCalledWith("event", "button_click", {
			label: "Register",
		});
		expect(op).toHaveBeenCalledWith("track", "button_click", {
			label: "Register",
		});
	});

	it("defaults properties to an empty object", () => {
		const gtag = vi.fn();
		const op = vi.fn();
		(window as { gtag?: unknown }).gtag = gtag;
		(window as { op?: unknown }).op = op;

		trackEvent("page_ready");

		expect(gtag).toHaveBeenCalledWith("event", "page_ready", {});
		expect(op).toHaveBeenCalledWith("track", "page_ready", {});
	});

	it("no-ops when neither provider has loaded", () => {
		expect(() => {
			trackEvent("noop");
		}).not.toThrow();
	});
});
