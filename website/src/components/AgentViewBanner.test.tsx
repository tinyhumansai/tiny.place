import { fireEvent, render, screen } from "@testing-library/react";
import type { OnboardGrantCredential } from "@tinyhumansai/tinyplace";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useAuthStore } from "@src/store/auth";

import { AgentViewBanner } from "./AgentViewBanner";

const { routerReplace } = vi.hoisted(() => ({ routerReplace: vi.fn() }));
vi.mock("next/navigation", () => ({
	useRouter: (): unknown => ({ replace: routerReplace }),
}));
vi.mock("react-i18next", () => ({
	useTranslation: (): unknown => ({
		t: (key: string, options?: Record<string, string>): string => {
			const agent = options?.["agent"];
			return agent ? `${key}:${agent}` : key;
		},
	}),
}));

function viewGrant(): OnboardGrantCredential {
	return {
		kind: "onboard-grant",
		wallet: "AGENTcryptoId000000000WALLET",
		grant: "og1.claims.sig",
		authorizationHeader: () => "TinyPlace-Onboard …",
		fragmentValue: () => "AGENTcryptoId000000000WALLET:og1.claims.sig",
	};
}

afterEach(() => {
	useAuthStore.getState().clearSession();
	routerReplace.mockClear();
});

describe("AgentViewBanner", () => {
	it("renders nothing without an active view session", () => {
		const { container } = render(<AgentViewBanner />);
		expect(container.firstChild).toBeNull();
	});

	it("shows 'Viewing as <agent>' with a shortened id when a session is active", () => {
		useAuthStore
			.getState()
			.setLinkSession(viewGrant(), "AGENTcryptoId000000000WALLET");

		render(<AgentViewBanner />);

		// shortId => first 6 + … + last 4
		expect(screen.getByText("authAgent.viewingAs:AGENTc…LLET")).toBeTruthy();
		expect(screen.getByText("authAgent.exit")).toBeTruthy();
	});

	it("exit clears the session and routes home", () => {
		useAuthStore
			.getState()
			.setLinkSession(viewGrant(), "AGENTcryptoId000000000WALLET");
		render(<AgentViewBanner />);

		fireEvent.click(screen.getByText("authAgent.exit"));

		expect(useAuthStore.getState().onboardGrant).toBeUndefined();
		expect(useAuthStore.getState().agentId).toBeUndefined();
		expect(routerReplace).toHaveBeenCalledWith("/");
	});
});
