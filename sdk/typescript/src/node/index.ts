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

// Harness runtime helpers. These carry Node built-in imports transitively
// (`harness-hooks` → `node:process`, `harness-envelope` → `node:crypto`), so
// they are exposed here on the Node subpath rather than the isomorphic root,
// keeping browser bundles free of Node-only module resolution. The matching
// types are re-exported from the root (`@tinyhumansai/tinyplace`).
export {
  claudeEventsFromLine,
  codexEventsFromLine,
  harnessEventsFromLine,
  normalizeToolKind,
  opencodeEventsFromLine,
  toolDisplay,
} from "../cli/harness-events.js";
export {
  claudeHookEventToSemantic,
  claudeHookEventsFromStdin,
  claudeHookStringToSemantic,
} from "../cli/harness-hooks.js";
export { initialStatus, reduceStatus, tickStatus } from "../cli/harness-status.js";
export { buildEventEnvelopeV2 } from "../cli/harness-envelope.js";
export {
  applySessionEnvelope,
  foldSessionEnvelopes,
  initialSessionView,
  isV2,
  parseSessionEnvelope,
} from "../cli/harness-consumer.js";

// Coding-agent daemon: the task protocol, provider detection/execution, and the
// serialized mailbox that `tinyplace daemon` composes. Exposed so an embedder can
// drive the same task loop programmatically.
export {
  TINYPLACE_PROTO,
  decodeTaskFrame,
  encodeTaskFrame,
} from "../cli/daemon/protocol.js";
export type {
  EncodeFrameInput,
  TaskFrame,
  TaskFrameKind,
} from "../cli/daemon/protocol.js";
export {
  DAEMON_PROVIDERS,
  buildRunArgs,
  detectProviders,
  makePathLookup,
  providerBin,
  runProviderTask,
} from "../cli/daemon/providers.js";
export type {
  DetectProvidersOptions,
  ExistsOnPath,
  RunTaskOptions,
  RunTaskResult,
  SpawnFn,
} from "../cli/daemon/providers.js";
export {
  createContactAutoAccepter,
  createLock,
  createMailbox,
} from "../cli/daemon/mailbox.js";
export type {
  Lock,
  Mailbox,
  MailboxHandler,
  MailboxOptions,
} from "../cli/daemon/mailbox.js";
export { DaemonRuntime, statusDetail } from "../cli/daemon/runtime.js";
export type { DaemonRuntimeDeps, RunTaskFn } from "../cli/daemon/runtime.js";
export { runDaemon } from "../cli/daemon.js";
export type { DaemonSummary } from "../cli/daemon.js";
