import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

type ButtonProperties = ButtonHTMLAttributes<HTMLButtonElement> & {
	variant?: ButtonVariant;
	size?: ButtonSize;
	/**
	 * Stable identifier reported to Google Analytics as the click label. Falls
	 * back to the button's aria-label / text content when omitted; set it for
	 * buttons whose visible text is dynamic or non-descriptive.
	 */
	analyticsId?: string;
	children?: ReactNode;
};

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
	primary: "bg-primary text-primary-front hover:bg-primary-hover border-transparent",
	secondary:
		"bg-surface-raised text-front border-border hover:border-border-strong",
	ghost: "bg-transparent text-front border-transparent hover:bg-surface-raised",
	danger: "bg-danger text-white border-transparent hover:opacity-90",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
	sm: "px-2.5 py-1 text-xs rounded-md",
	md: "px-3.5 py-2 text-sm rounded-lg",
	lg: "px-5 py-2.5 text-base rounded-lg",
};

/**
 * The shared button used across the app. It standardizes theme-token styling
 * and tags itself for analytics (`data-analytics-id`) so the global click
 * tracker can report a meaningful label without each call site wiring gtag.
 * The actual gtag `click` event is emitted by `AnalyticsClickTracker` via event
 * delegation, so this component never double-fires.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProperties>(
	function Button(
		{
			analyticsId,
			children,
			className,
			disabled,
			size = "md",
			type,
			variant = "primary",
			...rest
		},
		ref,
	): React.ReactElement {
		const classes = [
			"inline-flex items-center justify-center gap-2 border font-medium",
			"transition-colors disabled:cursor-not-allowed disabled:opacity-50",
			VARIANT_CLASSES[variant],
			SIZE_CLASSES[size],
			className ?? "",
		]
			.join(" ")
			.trim();
		return (
			<button
				ref={ref}
				className={classes}
				disabled={disabled}
				type={type ?? "button"}
				{...(analyticsId ? { "data-analytics-id": analyticsId } : {})}
				{...rest}
			>
				{children}
			</button>
		);
	},
);
