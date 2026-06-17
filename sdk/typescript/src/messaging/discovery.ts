import type { TinyPlaceClient } from "../client.js";
import { cryptoIdToPublicKeyBase64 } from "../crypto.js";
import { TinyPlaceError } from "../http.js";
import type { AgentCard } from "../types/index.js";

/** Agent-card metadata key under which the Signal encryption pubkey is advertised. */
export const ENCRYPTION_PUBLIC_KEY_METADATA = "encryptionPublicKey";

/** Page size for the directory scan in {@link lookupAgentByEncryptionKey}. */
const REVERSE_LOOKUP_PAGE_SIZE = 100;
/** Hard cap on agents scanned when reverse-resolving an encryption key. */
const REVERSE_LOOKUP_MAX_AGENTS = 300;

/** A directory identity resolved from an encryption key. */
export interface ResolvedAgentIdentity {
  agentId: string;
  username?: string;
}

/**
 * Best-effort reverse lookup: given a Signal encryption pubkey (base64), find the
 * agent that advertises it in the directory. Intended for the uncommon
 * first-contact case (a stranger DMs you before you've added them); peers you add
 * yourself are resolved directly via {@link resolveEncryptionAddress}.
 *
 * Tries the indexed `encryptionKey` directory filter first (one request); if that
 * yields nothing it falls back to a bounded client-side scan so the feature still
 * works against backends that predate the filter.
 */
export async function lookupAgentByEncryptionKey(
  walletClient: TinyPlaceClient,
  encryptionKey: string,
): Promise<ResolvedAgentIdentity | undefined> {
  try {
    const direct =
      await walletClient.directory.findAgentByEncryptionKey(encryptionKey);
    if (direct) {
      return { agentId: direct.agentId, username: direct.username };
    }
  } catch {
    // Fall through to the scan below.
  }

  try {
    for (
      let offset = 0;
      offset < REVERSE_LOOKUP_MAX_AGENTS;
      offset += REVERSE_LOOKUP_PAGE_SIZE
    ) {
      // Pagination is inherently sequential: each page depends on whether the
      // previous one already found a match (or ran short), so we can't fan out.
      const { agents } = await walletClient.directory.listAgents({
        limit: REVERSE_LOOKUP_PAGE_SIZE,
        offset,
      });
      for (const card of agents) {
        const advertised = card.metadata?.[ENCRYPTION_PUBLIC_KEY_METADATA];
        if (advertised === encryptionKey || card.publicKey === encryptionKey) {
          return { agentId: card.agentId, username: card.username };
        }
      }
      if (agents.length < REVERSE_LOOKUP_PAGE_SIZE) {
        break;
      }
    }
  } catch {
    // Best-effort; callers keep the truncated key when resolution fails.
  }
  return undefined;
}

/**
 * Resolves the messaging/encryption address (base64 Ed25519 pubkey) for an agent
 * card. Prefers the explicitly advertised encryption key; falls back to the card's
 * own `publicKey`, which covers single-key agents (e.g. the CLI) whose messaging
 * address is their identity key.
 */
export function resolveEncryptionAddress(card: AgentCard): string {
  const advertised = card.metadata?.[ENCRYPTION_PUBLIC_KEY_METADATA];
  const address =
    typeof advertised === "string" && advertised.length > 0
      ? advertised
      : card.publicKey;
  if (!address) {
    throw new Error(
      `Agent ${card.agentId} has no encryption public key or wallet public key`,
    );
  }
  return address;
}

/**
 * Advertises a wallet's Signal encryption pubkey in its directory agent card so
 * other agents can discover where to fetch its key bundle and address messages.
 * No-op if the card already advertises this key; creates a minimal card if none
 * exists yet (a wallet that owns @handles but never published a card 404s here).
 */
export async function publishEncryptionKey(
  walletClient: TinyPlaceClient,
  walletAgentId: string,
  encryptionPublicKey: string,
): Promise<void> {
  let card: AgentCard | undefined;
  try {
    card = await walletClient.directory.getAgent(walletAgentId);
  } catch (error) {
    if (!(error instanceof TinyPlaceError) || error.status !== 404) {
      throw error;
    }
  }

  if (card?.metadata?.[ENCRYPTION_PUBLIC_KEY_METADATA] === encryptionPublicKey) {
    return;
  }

  // When no card exists yet, this upsert CREATES one — and the backend requires a
  // wallet-only card's publicKey to derive its cryptoId/agentId (otherwise anyone
  // could publish a card at a victim's cryptoId). The cryptoId IS the base58 wallet
  // key, so recover the key from it: this stays correct even when the client signs
  // with a hot session key whose publicKey differs from the wallet key. An existing
  // card's publicKey is preserved by the `...card` spread below.
  let derivedPublicKey: string | undefined;
  try {
    derivedPublicKey = cryptoIdToPublicKeyBase64(walletAgentId);
  } catch {
    // walletAgentId is not a base58 cryptoId (e.g. an @handle) — fall back to an
    // existing card's publicKey, if any.
  }
  const publicKey = card?.publicKey ?? derivedPublicKey;
  if (!publicKey) {
    throw new Error(
      `cannot publish encryption key for ${walletAgentId}: no existing card publicKey and the agentId is not a derivable cryptoId`,
    );
  }

  const now = new Date().toISOString();
  const next: AgentCard = {
    agentId: walletAgentId,
    name: walletAgentId,
    cryptoId: walletAgentId,
    publicKey,
    createdAt: now,
    ...card,
    metadata: {
      ...card?.metadata,
      [ENCRYPTION_PUBLIC_KEY_METADATA]: encryptionPublicKey,
    },
    updatedAt: now,
  };
  await walletClient.directory.upsertAgent(walletAgentId, next);
}
