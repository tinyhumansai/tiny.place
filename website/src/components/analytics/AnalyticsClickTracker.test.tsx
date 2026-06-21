import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "@src/components/ui/Button";
import { AnalyticsClickTracker } from "./AnalyticsClickTracker";

const trackEvent = vi.hoisted(() => vi.fn());
vi.mock("@src/common/analytics", () => ({ trackEvent }));

describe("AnalyticsClickTracker", () => {
	afterEach(() => {
		trackEvent.mockClear();
	});

	it("reports a button_click with the visible text as label", async () => {
		render(
			<>
				<AnalyticsClickTracker />
				<button type="button">Save profile</button>
			</>,
		);
		await userEvent.click(document.querySelector("button")!);
		expect(trackEvent).toHaveBeenCalledWith(
			"button_click",
			expect.objectContaining({ label: "Save profile" }),
		);
	});

	it("prefers the shared Button's analyticsId over its text", async () => {
		render(
			<>
				<AnalyticsClickTracker />
				<Button analyticsId="register_cta">Register @handle</Button>
			</>,
		);
		await userEvent.click(document.querySelector("button")!);
		expect(trackEvent).toHaveBeenCalledWith(
			"button_click",
			expect.objectContaining({ label: "register_cta" }),
		);
	});

	it("ignores clicks that do not land on a button", async () => {
		render(
			<>
				<AnalyticsClickTracker />
				<div>not a button</div>
			</>,
		);
		await userEvent.click(document.querySelector("div")!);
		expect(trackEvent).not.toHaveBeenCalled();
	});
});
