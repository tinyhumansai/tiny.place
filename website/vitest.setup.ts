import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom has no ResizeObserver; Nivo's responsive charts mount one. Provide a
// no-op so chart-bearing components can render in unit tests.
if (typeof globalThis.ResizeObserver === "undefined") {
	globalThis.ResizeObserver = class {
		observe(): void {}
		unobserve(): void {}
		disconnect(): void {}
	};
}

// Node 25 ships an experimental native `localStorage`/`sessionStorage` global
// that shadows jsdom's implementation, but its methods are inert unless the
// process is launched with `--localstorage-file` (so `setItem` is undefined).
// zustand's persist middleware then throws "storage.setItem is not a function".
// Install a real in-memory Web Storage so persisted stores behave as in the
// browser.
function createMemoryStorage(): Storage {
	const map = new Map<string, string>();
	return {
		getItem: (key): string | null => (map.has(key) ? map.get(key)! : null),
		setItem: (key, value): void => {
			map.set(key, String(value));
		},
		removeItem: (key): void => {
			map.delete(key);
		},
		clear: (): void => {
			map.clear();
		},
		key: (index): string | null => Array.from(map.keys())[index] ?? null,
		get length(): number {
			return map.size;
		},
	};
}

for (const name of ["localStorage", "sessionStorage"] as const) {
	Object.defineProperty(globalThis, name, {
		value: createMemoryStorage(),
		configurable: true,
		writable: true,
	});
}

// runs a cleanup after each test case (e.g. clearing jsdom)
afterEach(() => {
	cleanup();
	localStorage.clear();
	sessionStorage.clear();
});
