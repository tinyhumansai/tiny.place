import { useSyncExternalStore } from "react";

const emptySubscribe = (): (() => void) => (): void => {};
const getSnapshot = (): boolean => true;
const getServerSnapshot = (): boolean => false;

/**
 * Returns `false` during SSR and the first client paint, then `true` once the
 * component has hydrated. Uses `useSyncExternalStore` (rather than a setState
 * effect) so it stays consistent across hydration without triggering cascading
 * renders. Mirrors the gate inside {@link ClientOnly}, but exposes the boolean
 * so callers can swap subtrees rather than render nothing.
 */
export function useHydrated(): boolean {
	return useSyncExternalStore(emptySubscribe, getSnapshot, getServerSnapshot);
}
