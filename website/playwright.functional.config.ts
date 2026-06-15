import { defineConfig, devices } from "@playwright/test";

const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:3000";

export default defineConfig({
	testDir: "./e2e",
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: 1,
	reporter: "html",
	use: {
		baseURL: FRONTEND_URL,
		trace: "on-first-retry",
	},
	projects: [
		{
			name: "chromium",
			testMatch: /functional-.*\.spec\.ts/,
			use: { ...devices["Desktop Chrome"] },
		},
	],
});
