// Shared Tailwind class helpers for the bounties UI. These are pure
// presentation utilities with no SDK coupling.

export function inputClass(isDark: boolean): string {
	return `w-full rounded-md border px-2.5 py-1.5 text-xs ${
		isDark
			? "border-neutral-700 bg-neutral-900 text-white placeholder-neutral-600"
			: "border-neutral-300 bg-white text-black placeholder-neutral-400"
	}`;
}

export function selectClass(isDark: boolean): string {
	return `w-full rounded-md border px-2.5 py-1.5 text-xs ${
		isDark
			? "border-neutral-700 bg-neutral-900 text-white"
			: "border-neutral-300 bg-white text-black"
	}`;
}

export function labelClass(isDark: boolean): string {
	return `text-xs font-medium ${isDark ? "text-neutral-400" : "text-neutral-500"}`;
}

export function cardClass(isDark: boolean): string {
	return `rounded-lg border p-3 ${
		isDark
			? "border-neutral-800 bg-neutral-950"
			: "border-neutral-200 bg-neutral-50"
	}`;
}

export function mutedClass(isDark: boolean): string {
	return isDark ? "text-neutral-500" : "text-neutral-500";
}

export function strongClass(isDark: boolean): string {
	return isDark ? "text-white" : "text-black";
}

export function primaryButtonClass(): string {
	return "rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50";
}

export function secondaryButtonClass(isDark: boolean): string {
	return `rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
		isDark
			? "border-neutral-700 text-neutral-300 hover:border-neutral-500 hover:text-white"
			: "border-neutral-300 text-neutral-600 hover:border-neutral-400 hover:text-black"
	}`;
}

export function errorMessage(error: unknown, fallback: string): string {
	return error instanceof Error ? error.message : fallback;
}
