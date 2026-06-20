// Node-only entry point (`@tinyhumansai/tinyplace/node`): runtime adapters that
// depend on Node built-ins (node:fs, node:os) and must not be pulled into browser
// bundles. The isomorphic core lives in the main entry.
import { registerDefaultSessionStore } from "../agent/agent.js";
import { FileSessionStore } from "./file-session-store.js";

// Side effect: make `Agent.create` persist to disk on Node when no store is
// passed. The core never imports this module, so browser bundles stay clean;
// importing `@tinyhumansai/tinyplace/node` (which a Node app does for the store)
// opts into filesystem persistence.
registerDefaultSessionStore(async (signer) => {
  return new FileSessionStore(
    FileSessionStore.defaultPath(signer.publicKeyBase64),
    await signer.getX25519KeyPair(),
  );
});

export { FileSessionStore } from "./file-session-store.js";
