// The Signal session persistence (IndexedDB) now lives in the SDK so the browser
// app and the CLI share one implementation. This module re-exports it to keep the
// website's import paths stable.
export {
	IndexedDbSessionStore,
	openSignalDatabase,
	loadStoredSeed,
	storeSeed,
} from "@tinyhumansai/tinyplace/browser";
