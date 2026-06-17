// Node-only entry point (`@tinyhumansai/tinyplace/node`): runtime adapters that
// depend on Node built-ins (node:fs, node:os) and must not be pulled into browser
// bundles. The isomorphic core lives in the main entry.
export { FileSessionStore } from "./file-session-store.js";
