const MICROS_PER_USDC = 1_000_000;

/** Formats a USDC base-unit (micros) string as a human-readable USDC amount. */
export function formatUsdc(micros: string | null | undefined): string {
	if (!micros) {
		return "0";
	}
	let value: number;
	try {
		value = Number(BigInt(micros)) / MICROS_PER_USDC;
	} catch {
		value = Number(micros) / MICROS_PER_USDC;
	}
	if (!Number.isFinite(value)) {
		return "0";
	}
	return value.toLocaleString(undefined, {
		maximumFractionDigits: 2,
		minimumFractionDigits: 0,
	});
}

/** Converts a whole-USDC amount into a base-unit (micros) string. */
export function usdcToMicros(usdc: number): string {
	return String(Math.round(usdc * MICROS_PER_USDC));
}
