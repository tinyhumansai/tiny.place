/**
 * Handle normalization shared across the agent facade. A `@handle` is the
 * human-facing identifier; most facade methods accept a bare name (`iris`) or a
 * prefixed one (`@iris`) and normalize to the canonical `@iris` form before
 * resolving.
 */

/** Ensures a handle has a leading `@`. Rejects empty / whitespace-only input. */
export function normalizeHandle(name: string): string {
  const trimmed = name.trim();
  const normalized = trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
  if (normalized.length <= 1) {
    throw new Error("handle is empty");
  }
  return normalized;
}
