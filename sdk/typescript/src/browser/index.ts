// Browser-only entry point (`@tinyhumansai/tinyplace/browser`): runtime adapters
// that depend on Web APIs (IndexedDB) and must not be pulled into Node bundles.
// The isomorphic core lives in the main entry.
export {
  IndexedDbSessionStore,
  openSignalDatabase,
  loadStoredSeed,
  storeSeed,
} from "./indexeddb-session-store.js";
