import { createRouter } from "@tanstack/react-router";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import { trackPageView } from "./common/gtag.ts";
import { PasswordGate } from "./components/PasswordGate.tsx";
import { routeTree } from "./routeTree.gen.ts";
import "./styles/tailwind.css";
import "./common/i18n";

const router = createRouter({ routeTree });

router.subscribe("onResolved", ({ toLocation }) => {
	trackPageView(toLocation.href);
});

export type TanstackRouter = typeof router;

declare module "@tanstack/react-router" {
	interface Register {
		// This infers the type of our router and registers it across your entire project
		router: TanstackRouter;
	}
}

const rootElement = document.querySelector("#root") as Element;
if (!rootElement.innerHTML) {
	const root = ReactDOM.createRoot(rootElement);
	root.render(
		<React.StrictMode>
			<React.Suspense
				fallback={
					<div className="min-h-screen w-full flex items-center justify-center bg-black">
						<div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-700 border-t-white" />
					</div>
				}
			>
				<PasswordGate>
					<App router={router} />
				</PasswordGate>
			</React.Suspense>
		</React.StrictMode>
	);
}
