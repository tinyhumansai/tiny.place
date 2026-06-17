import type {
  PreKeyPair,
  SessionState,
  SessionStore,
  SignedPreKeyPair,
  X25519KeyPair,
} from "../signal/index.js";

const DB_NAME = "tinyplace-signal";
const DB_VERSION = 1;

const STORE_SEEDS = "seeds";
const STORE_SIGNED_PREKEYS = "signedPreKeys";
const STORE_PREKEYS = "preKeys";
const STORE_SESSIONS = "sessions";
const STORE_META = "meta";

const ALL_STORES = [
  STORE_SEEDS,
  STORE_SIGNED_PREKEYS,
  STORE_PREKEYS,
  STORE_SESSIONS,
  STORE_META,
] as const;

function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = (): void => {
      resolve(request.result);
    };
    request.onerror = (): void => {
      reject(request.error ?? new Error("IndexedDB request failed"));
    };
  });
}

/** Opens (and migrates) the shared Signal IndexedDB database. */
export function openSignalDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (): void => {
      const db = request.result;
      for (const store of ALL_STORES) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store);
        }
      }
    };
    request.onsuccess = (): void => {
      resolve(request.result);
    };
    request.onerror = (): void => {
      reject(request.error ?? new Error("Failed to open Signal database"));
    };
  });
}

async function idbGet<T>(
  db: IDBDatabase,
  store: string,
  key: string,
): Promise<T | undefined> {
  const tx = db.transaction(store, "readonly");
  return promisifyRequest<T | undefined>(
    tx.objectStore(store).get(key) as IDBRequest<T | undefined>,
  );
}

async function idbPut(
  db: IDBDatabase,
  store: string,
  key: string,
  value: unknown,
): Promise<void> {
  const tx = db.transaction(store, "readwrite");
  await promisifyRequest(tx.objectStore(store).put(value, key));
}

async function idbDelete(
  db: IDBDatabase,
  store: string,
  key: string,
): Promise<void> {
  const tx = db.transaction(store, "readwrite");
  await promisifyRequest(tx.objectStore(store).delete(key));
}

/** Writes several records across stores in a single atomic transaction. */
function idbPutAll(
  db: IDBDatabase,
  entries: Array<{ store: string; key: string; value: unknown }>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const stores = Array.from(new Set(entries.map((entry) => entry.store)));
    const tx = db.transaction(stores, "readwrite");
    tx.oncomplete = (): void => {
      resolve();
    };
    tx.onerror = (): void => {
      reject(tx.error ?? new Error("IndexedDB transaction failed"));
    };
    tx.onabort = (): void => {
      reject(tx.error ?? new Error("IndexedDB transaction aborted"));
    };
    for (const entry of entries) {
      tx.objectStore(entry.store).put(entry.value, entry.key);
    }
  });
}

async function idbGetAllByPrefix<T>(
  db: IDBDatabase,
  store: string,
  prefix: string,
): Promise<Array<T>> {
  const tx = db.transaction(store, "readonly");
  const range = IDBKeyRange.bound(prefix, `${prefix}￿`);
  return promisifyRequest<Array<T>>(
    tx.objectStore(store).getAll(range) as IDBRequest<Array<T>>,
  );
}

/** Reads a persisted identity seed for a wallet, if one exists. */
export async function loadStoredSeed(
  db: IDBDatabase,
  ownerId: string,
): Promise<Uint8Array | undefined> {
  return idbGet<Uint8Array>(db, STORE_SEEDS, ownerId);
}

/** Persists an identity seed for a wallet. */
export async function storeSeed(
  db: IDBDatabase,
  ownerId: string,
  seed: Uint8Array,
): Promise<void> {
  await idbPut(db, STORE_SEEDS, ownerId, seed);
}

/**
 * IndexedDB-backed {@link SessionStore} for browser runtimes. Persists the Signal
 * signed pre-key, one-time pre-keys, and ratchet sessions so encrypted
 * conversations survive reloads. All records are namespaced by the owning wallet's
 * agent id so multiple identities can share one browser. The identity X25519 key
 * itself is derived from the seed (via the signer) and supplied at construction.
 *
 * Records contain `Uint8Array` and `Map` values, which the structured-clone
 * algorithm used by IndexedDB preserves, so no manual serialization is needed.
 */
export class IndexedDbSessionStore implements SessionStore {
  private readonly db: IDBDatabase;
  private readonly ownerId: string;
  private readonly identityKeyPair: X25519KeyPair;

  public constructor(
    db: IDBDatabase,
    ownerId: string,
    identityKeyPair: X25519KeyPair,
  ) {
    this.db = db;
    this.ownerId = ownerId;
    this.identityKeyPair = identityKeyPair;
  }

  private scoped(id: string): string {
    return `${this.ownerId}:${id}`;
  }

  private prefix(): string {
    return `${this.ownerId}:`;
  }

  public getIdentityX25519KeyPair(): Promise<X25519KeyPair> {
    return Promise.resolve(this.identityKeyPair);
  }

  public async getSignedPreKey(
    keyId: string,
  ): Promise<SignedPreKeyPair | null> {
    const result = await idbGet<SignedPreKeyPair>(
      this.db,
      STORE_SIGNED_PREKEYS,
      this.scoped(keyId),
    );
    return result ?? null;
  }

  public async getActiveSignedPreKey(): Promise<SignedPreKeyPair> {
    const activeId = await idbGet<string>(
      this.db,
      STORE_META,
      this.scoped("activeSignedPreKey"),
    );
    if (!activeId) {
      throw new Error("No active signed pre-key");
    }
    const key = await this.getSignedPreKey(activeId);
    if (!key) {
      throw new Error("Active signed pre-key not found");
    }
    return key;
  }

  public async storeSignedPreKey(preKey: SignedPreKeyPair): Promise<void> {
    // Atomic: persist the key and mark it active in one transaction, so a partial
    // failure can't leave a stored key that getActiveSignedPreKey() can't find.
    await idbPutAll(this.db, [
      {
        store: STORE_SIGNED_PREKEYS,
        key: this.scoped(preKey.keyId),
        value: preKey,
      },
      {
        store: STORE_META,
        key: this.scoped("activeSignedPreKey"),
        value: preKey.keyId,
      },
    ]);
  }

  public async getPreKey(keyId: string): Promise<PreKeyPair | null> {
    const result = await idbGet<PreKeyPair>(
      this.db,
      STORE_PREKEYS,
      this.scoped(keyId),
    );
    return result ?? null;
  }

  public async removePreKey(keyId: string): Promise<void> {
    await idbDelete(this.db, STORE_PREKEYS, this.scoped(keyId));
  }

  public async storePreKey(preKey: PreKeyPair): Promise<void> {
    await idbPut(this.db, STORE_PREKEYS, this.scoped(preKey.keyId), preKey);
  }

  public async getAllPreKeys(): Promise<Array<PreKeyPair>> {
    return idbGetAllByPrefix<PreKeyPair>(this.db, STORE_PREKEYS, this.prefix());
  }

  public async getSession(address: string): Promise<SessionState | null> {
    const result = await idbGet<SessionState>(
      this.db,
      STORE_SESSIONS,
      this.scoped(address),
    );
    return result ?? null;
  }

  public async storeSession(
    address: string,
    session: SessionState,
  ): Promise<void> {
    await idbPut(this.db, STORE_SESSIONS, this.scoped(address), session);
  }

  public async removeSession(address: string): Promise<void> {
    await idbDelete(this.db, STORE_SESSIONS, this.scoped(address));
  }
}
