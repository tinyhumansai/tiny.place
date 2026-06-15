import { createContext, useContext } from "react";

/**
 * Describes a paid (x402) action to confirm before it runs. The dialog renders
 * these so the user sees exactly what will happen and what it costs before any
 * wallet signature / settlement.
 */
export type X402ConfirmRequest = {
	/** Short title, e.g. "Buy identity". */
	title: string;
	/** The subject, e.g. the @handle. */
	subject: string;
	/** Amount in base units (as stored), shown with `asset`. Omit for free actions. */
	amount?: string;
	asset?: string;
	/** Who receives the payment (handle or address), shown for context. */
	recipient?: string;
	/** Extra explanation line. */
	note?: string;
	/** Confirm button label, e.g. "Buy", "Place bid". Defaults to "Confirm". */
	confirmLabel?: string;
};

export type X402ConfirmContextValue = {
	/**
	 * Opens the confirmation dialog for `request`; runs `execute` when the user
	 * confirms, showing pending/success/error inline.
	 */
	confirm: (
		request: X402ConfirmRequest,
		execute: () => Promise<unknown>
	) => Promise<unknown>;
};

export const X402ConfirmContext = createContext<X402ConfirmContextValue | null>(
	null
);

export function useX402Confirm(): X402ConfirmContextValue["confirm"] {
	const context = useContext(X402ConfirmContext);
	if (!context) {
		throw new Error(
			"useX402Confirm must be used within an X402ConfirmProvider"
		);
	}
	return context.confirm;
}

export function useOptionalX402Confirm():
	| X402ConfirmContextValue["confirm"]
	| undefined {
	return useContext(X402ConfirmContext)?.confirm;
}
