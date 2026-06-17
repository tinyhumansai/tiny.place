// Encryption-key directory discovery/advertising now lives in the SDK so the
// browser app and the CLI share one implementation. Re-exported here to keep the
// website's import paths stable.
export {
	ENCRYPTION_PUBLIC_KEY_METADATA,
	resolveEncryptionAddress,
	lookupAgentByEncryptionKey,
	publishEncryptionKey,
} from "@tinyhumansai/tinyplace";
export type { ResolvedAgentIdentity } from "@tinyhumansai/tinyplace";
