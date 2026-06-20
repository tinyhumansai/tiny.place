import type { SigningKey } from "../auth.js";
import { signFreshCanonicalPayload } from "../auth.js";
import { canonicalPayload, cryptoIdToPublicKeyBase64 } from "../crypto.js";
import {
  TinyPlaceError,
  type BodySigner,
  type HttpClient,
  type PaymentChallenge,
} from "../http.js";
import {
  buildX402PaymentMap,
  type X402PaymentMap,
  type X402PaymentMapOptions,
} from "../x402.js";
import {
  executeSolanaX402Payment,
  SOLANA_MAINNET_NETWORK,
  SOLANA_USDC_MINT,
  type SolanaX402PaymentExecution,
  type SolanaX402PaymentExecutionOptions,
} from "../solana.js";
import type {
  ActorType,
  AvailabilityResponse,
  Identity,
  IdentityClaimRequest,
  IdentityExport,
  IdentityTransferRequest,
  PaymentMethod,
  ProfileVisibility,
  ProfileVisibilityUpdate,
  RenewalRequest,
  Subname,
  SubnameCreateRequest,
} from "../types/index.js";

export interface RegisterRequest {
  username: string;
  cryptoId: string;
  /**
   * Optional. A Solana `cryptoId` IS the base58 Ed25519 public key, so the SDK
   * derives `publicKey` (base64) from `cryptoId` when omitted, and the backend
   * derives it server-side too. Supply it only to override the derivation; if
   * supplied it must derive the same `cryptoId`.
   */
  publicKey?: string;
  paymentMethods?: Array<PaymentMethod>;
  /**
   * The wallet's self-declared, trust-based actor type ("human"/"agent"),
   * recorded on the wallet's User profile when it is first provisioned. Not part
   * of the signed payload — the backend trusts the claim. Defaults to "agent".
   */
  actorType?: ActorType;
  /**
   * Request that this name be assigned as the wallet's primary handle. When
   * omitted, the backend still auto-assigns it as primary if the wallet has no
   * primary yet (a wallet's first name is always its primary).
   */
  primary?: boolean;
  payment?: Record<string, string>;
  signature?: string;
}

export interface SolanaRegistrationPaymentOptions
  extends Omit<SolanaX402PaymentExecutionOptions, "payment" | "signer"> {
  amount?: string;
  to?: string;
  asset?: string;
  network?: string;
  nonce?: string;
  expiresAt?: string;
  expiresInMs?: number;
  metadata?: Record<string, string>;
  registrationAttempts?: number;
  registrationIntervalMs?: number;
  registrationRetryErrors?: Array<string>;
}

export interface SolanaRegistrationResult {
  identity: Identity;
  payment: SolanaX402PaymentExecution;
}

export interface SolanaRegistrationFailure extends Error {
  registrationPayment?: SolanaX402PaymentExecution | X402PaymentMap;
  onChainTx?: string;
}

export interface SolanaRegistrationProofOptions
  extends Partial<Pick<
    X402PaymentMapOptions,
    "amount" | "asset" | "network" | "nonce" | "expiresAt" | "expiresInMs" | "metadata"
  >> {
  onChainTx: string;
  to?: string;
  registrationAttempts?: number;
  registrationIntervalMs?: number;
  registrationRetryErrors?: Array<string>;
}

export interface SolanaRegistrationProofResult {
  identity: Identity;
  onChainTx: string;
  payment: X402PaymentMap;
}

const DEFAULT_REGISTRATION_ATTEMPTS = 30;
const DEFAULT_REGISTRATION_INTERVAL_MS = 3000;
const DEFAULT_REGISTRATION_RETRY_ERRORS = [
  "transaction not found",
  "insufficient confirmations",
];

export class RegistryApi {
  constructor(
    private readonly http: HttpClient,
    private readonly signingKey?: SigningKey,
  ) {}

  async register(request: RegisterRequest): Promise<Identity> {
    request = normalizeRegisterRequest(request);

    const headers: Record<string, string> = {};
    if (this.signingKey && !request.signature) {
      // Present the signing key so the backend can authorize a delegated hot
      // session key: it verifies the signature against this key, then checks the
      // key is an active delegate of request.publicKey (the wallet key the handle
      // binds to). For a direct wallet/agent signer the presented key IS
      // request.publicKey, so the backend treats it as plain ownership — letting
      // agents keep signing registrations with their own key.
      const presentedKey = this.http.signingPublicKey();
      if (presentedKey) {
        headers["X-TinyPlace-Public-Key"] = presentedKey;
      }
    }

    return this.http.postPublic<Identity>(
      "/registry/names",
      request,
      headers,
      this.freshBodySigner(registrationSignaturePayload),
    );
  }

  async registerWithSolanaPayment(
    request: Omit<RegisterRequest, "payment"> & { payment?: never },
    options: SolanaRegistrationPaymentOptions,
  ): Promise<SolanaRegistrationResult> {
    if (!this.signingKey) {
      throw new Error("registerWithSolanaPayment requires a signing key");
    }

    const normalizedRequest = normalizeRegisterRequest(request);
    const challenge =
      options.amount && options.to
        ? undefined
        : await this.registrationPaymentChallenge(normalizedRequest);
    const amount = options.amount ?? challenge?.amount;
    const to = options.to ?? challenge?.to;
    if (!amount || !to) {
      throw new Error("registration payment requires amount and recipient");
    }

    const payment = await executeSolanaX402Payment({
      ...options,
      mint: options.mint ?? SOLANA_USDC_MINT,
      signer: this.signingKey,
      payment: {
        scheme: "exact",
        network: options.network ?? challenge?.network ?? SOLANA_MAINNET_NETWORK,
        asset: options.asset ?? challenge?.asset ?? "USDC",
        amount,
        from: normalizedRequest.cryptoId,
        to,
        nonce:
          options.nonce ??
          challenge?.nonce ??
          generateRegistrationNonce(normalizedRequest.username),
        expiresAt: options.expiresAt ?? challenge?.expiresAt,
        expiresInMs: options.expiresInMs,
        metadata: {
          ...challenge?.metadata,
          identity: normalizedRequest.username,
          purpose: "registration",
          ...options.metadata,
        },
        publicKeyBase64: normalizedRequest.publicKey,
      },
    });
    let identity: Identity;
    try {
      identity = await this.registerWithPaymentMap(
        normalizedRequest,
        payment.payment,
        options,
      );
    } catch (error) {
      throw attachRegistrationPayment(error, payment);
    }

    return { identity, payment };
  }

  async registerWithExistingSolanaPayment(
    request: Omit<RegisterRequest, "payment"> & { payment?: never },
    options: SolanaRegistrationProofOptions,
  ): Promise<SolanaRegistrationProofResult> {
    if (!this.signingKey) {
      throw new Error("registerWithExistingSolanaPayment requires a signing key");
    }

    const normalizedRequest = normalizeRegisterRequest(request);
    const challenge =
      options.amount && options.to
        ? undefined
        : await this.registrationPaymentChallenge(normalizedRequest);
    const amount = options.amount ?? challenge?.amount;
    const to = options.to ?? challenge?.to;
    if (!amount || !to) {
      throw new Error("registration payment requires amount and recipient");
    }

    const payment = await buildX402PaymentMap(this.signingKey, {
      scheme: "exact",
      network: options.network ?? challenge?.network ?? SOLANA_MAINNET_NETWORK,
      asset: options.asset ?? challenge?.asset ?? "USDC",
      amount,
      from: normalizedRequest.cryptoId,
      to,
      nonce:
        options.nonce ??
        challenge?.nonce ??
        generateRegistrationNonce(normalizedRequest.username),
      expiresAt: options.expiresAt ?? challenge?.expiresAt,
      expiresInMs: options.expiresInMs,
      onChainTx: options.onChainTx,
      tx: options.onChainTx,
      transaction: options.onChainTx,
      metadata: {
        ...challenge?.metadata,
        identity: normalizedRequest.username,
        purpose: "registration",
        ...options.metadata,
      },
      publicKeyBase64: normalizedRequest.publicKey,
    });
    let identity: Identity;
    try {
      identity = await this.registerWithPaymentMap(
        normalizedRequest,
        payment,
        options,
      );
    } catch (error) {
      throw attachRegistrationPayment(error, payment);
    }

    return { identity, onChainTx: options.onChainTx, payment };
  }

  private async registrationPaymentChallenge(
    request: RegisterRequest,
  ): Promise<PaymentChallenge | undefined> {
    try {
      await this.register(request);
    } catch (error) {
      if (error instanceof TinyPlaceError && error.status === 402) {
        return error.paymentRequired?.payment;
      }
      throw error;
    }
    throw new Error("registration did not return a payment challenge");
  }

  private async registerWithPaymentMap(
    request: RegisterRequest,
    payment: X402PaymentMap,
    options: {
      registrationAttempts?: number;
      registrationIntervalMs?: number;
      registrationRetryErrors?: Array<string>;
    },
  ): Promise<Identity> {
    try {
      return await this.registerRetryingPayment({
        ...request,
        payment,
      }, {
        attempts: options.registrationAttempts,
        intervalMs: options.registrationIntervalMs,
        retryErrors: options.registrationRetryErrors,
      });
    } catch (error) {
      const recovered = await this.createdIdentityAfterRegistrationError(
        request.username,
        error,
      );
      if (!recovered) {
        throw error;
      }
      return recovered;
    }
  }

  private async createdIdentityAfterRegistrationError(
    username: string,
    error: unknown,
  ): Promise<Identity | undefined> {
    if (!(error instanceof TinyPlaceError) || error.status < 500) {
      return undefined;
    }
    try {
      const result = await this.get(username);
      return result.available ? undefined : result.identity;
    } catch {
      return undefined;
    }
  }

  get(name: string): Promise<AvailabilityResponse> {
    return this.http.get<AvailabilityResponse>(
      `/registry/names/${encodeURIComponent(name)}`,
    );
  }

  export(name: string): Promise<IdentityExport> {
    return this.http.get<IdentityExport>(
      `/registry/names/${encodeURIComponent(name)}/export`,
    );
  }

  exportIdentity(name: string): Promise<IdentityExport> {
    return this.export(name);
  }

  async updateProfileVisibility(
    name: string,
    update: ProfileVisibilityUpdate,
  ): Promise<ProfileVisibility> {
    return this.http.putDirectoryAuth<ProfileVisibility>(
      `/registry/names/${encodeURIComponent(name)}/profile-visibility`,
      update,
      this.freshBodySigner((body) =>
        canonicalPayload("identity.profile.visibility", {
          activity: body.activity ?? null,
          agentCard: body.agentCard ?? null,
          attestations: body.attestations ?? null,
          broadcasts: body.broadcasts ?? null,
          groups: body.groups ?? null,
          searchEngineIndexing: body.searchEngineIndexing ?? null,
          username: name,
        }),
      ),
    );
  }

  async renew(name: string, request: RenewalRequest): Promise<Identity> {
    return this.http.postDirectoryAuth<Identity>(
      `/registry/names/${encodeURIComponent(name)}/renew`,
      request,
      this.freshBodySigner(() =>
        canonicalPayload("identity.renew", { username: name }),
      ),
    );
  }

  /**
   * Directly transfer this name to another wallet with no payment (a gift or
   * account move), distinct from the paid marketplace flow. The CURRENT owner
   * (this client's signing key, or an approved delegate) authorizes the move;
   * `request.cryptoId`/`request.publicKey` identify the recipient. The name
   * keeps its registration period and the recipient receives it unassigned.
   */
  async transfer(
    name: string,
    request: IdentityTransferRequest,
  ): Promise<Identity> {
    return this.http.postDirectoryAuth<Identity>(
      `/registry/names/${encodeURIComponent(name)}/transfer`,
      request,
      this.freshBodySigner((body) =>
        canonicalPayload("identity.transfer", {
          cryptoId: body.cryptoId,
          publicKey: body.publicKey,
          username: name,
        }),
      ),
    );
  }

  /**
   * Assign this name as the owner wallet's primary handle. Clears the primary
   * flag on the wallet's other names (one primary per wallet) and locks this
   * name from sale until it is unassigned.
   */
  async assignPrimary(name: string): Promise<Identity> {
    return this.setPrimary(name, true);
  }

  /**
   * Unassign this name as primary, leaving it unassigned and therefore sellable.
   */
  async unassignPrimary(name: string): Promise<Identity> {
    return this.setPrimary(name, false);
  }

  private async setPrimary(name: string, primary: boolean): Promise<Identity> {
    const action = primary ? "identity.assign" : "identity.unassign";
    return this.http.postDirectoryAuth<Identity>(
      `/registry/names/${encodeURIComponent(name)}/${primary ? "assign" : "unassign"}`,
      {},
      this.freshBodySigner(() => canonicalPayload(action, { username: name })),
    );
  }

  async claim(name: string, request: IdentityClaimRequest): Promise<Identity> {
    return this.http.post<Identity>(
      `/registry/names/${encodeURIComponent(name)}/claim`,
      request,
      this.freshBodySigner((body) =>
        canonicalPayload("identity.claim", {
          cryptoId: body.cryptoId,
          publicKey: body.publicKey,
          username: name,
        }),
      ),
    );
  }

  async createSubname(
    name: string,
    request: SubnameCreateRequest,
  ): Promise<Subname> {
    return this.http.postDirectoryAuth<Subname>(
      `/registry/names/${encodeURIComponent(name)}/subnames`,
      request,
      this.freshBodySigner((body) =>
        canonicalPayload("identity.subname.create", {
          bio: body.bio,
          subname: body.subname,
          target: body.target,
          username: name,
        }),
      ),
    );
  }

  async deleteSubname(name: string, subname: string): Promise<Identity> {
    const headers: Record<string, string> = {};
    if (this.signingKey) {
      const payload = canonicalPayload("identity.subname.delete", {
        subname,
        username: name,
      });
      headers["X-TinyPlace-Signature"] = await signFreshCanonicalPayload(
        this.signingKey,
        payload,
      );
      // Present the signing key so the backend can authorize a delegated hot
      // session key (the X-TinyPlace-Signature above is the ownership proof).
      const presentedKey = this.http.signingPublicKey();
      if (presentedKey) {
        headers["X-TinyPlace-Public-Key"] = presentedKey;
      }
    }
    return this.http.deletePublic<Identity>(
      `/registry/names/${encodeURIComponent(name)}/subnames/${encodeURIComponent(subname)}`,
      undefined,
      headers,
    );
  }

  private freshBodySigner<TBody extends { signature?: string }>(
    payload: (body: TBody) => string,
  ): BodySigner<TBody> | undefined {
    if (!this.signingKey) {
      return undefined;
    }
    return async (body): Promise<TBody> => {
      if (body.signature) {
        return body;
      }
      return {
        ...body,
        signature: await signFreshCanonicalPayload(
          this.signingKey as SigningKey,
          payload(body),
        ),
      };
    };
  }

  private async registerRetryingPayment(
    request: RegisterRequest,
    options: {
      attempts?: number;
      intervalMs?: number;
      retryErrors?: Array<string>;
    },
  ): Promise<Identity> {
    const attempts = options.attempts ?? DEFAULT_REGISTRATION_ATTEMPTS;
    const intervalMs =
      options.intervalMs ?? DEFAULT_REGISTRATION_INTERVAL_MS;
    const retryErrors =
      options.retryErrors ?? DEFAULT_REGISTRATION_RETRY_ERRORS;
    let lastError: unknown;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        return await this.register(request);
      } catch (error) {
        lastError = error;
        if (!isRetryablePaymentError(error, retryErrors)) {
          throw error;
        }
        if (attempt + 1 < attempts && intervalMs > 0) {
          await sleep(intervalMs);
        }
      }
    }

    throw lastError;
  }
}

function normalizeHandle(name: string): string {
  const trimmed = name.trim();
  if (trimmed.startsWith("@")) {
    return trimmed;
  }
  return `@${trimmed}`;
}

function generateRegistrationNonce(username: string): string {
  const random = new Uint8Array(12);
  globalThis.crypto.getRandomValues(random);
  const suffix = Array.from(random, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `register_${username.replace(/^@+/, "")}_${suffix}`;
}

function sleep(intervalMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, intervalMs);
  });
}

function isRetryablePaymentError(
  error: unknown,
  retryErrors: Array<string>,
): boolean {
  if (!(error instanceof TinyPlaceError) || error.status !== 402) {
    return false;
  }
  const message = paymentErrorMessage(error.body);
  return retryErrors.some((retryError) =>
    message.includes(retryError.toLowerCase()),
  );
}

function paymentErrorMessage(body: unknown): string {
  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "string"
  ) {
    return body.error.toLowerCase();
  }
  if (typeof body === "string") {
    return body.toLowerCase();
  }
  return "";
}

function attachRegistrationPayment(
  error: unknown,
  payment: SolanaX402PaymentExecution | X402PaymentMap,
): unknown {
  if (typeof error === "object" && error !== null) {
    const failure = error as SolanaRegistrationFailure;
    failure.registrationPayment = payment;
    failure.onChainTx = registrationPaymentTx(payment);
  }
  return error;
}

function registrationPaymentTx(
  payment: SolanaX402PaymentExecution | X402PaymentMap,
): string | undefined {
  if (
    "payment" in payment &&
    "signature" in payment &&
    typeof payment.signature === "string"
  ) {
    return payment.signature;
  }
  const paymentMap = payment as X402PaymentMap;
  return paymentMap["onChainTx"] ?? paymentMap["tx"] ?? paymentMap["transaction"];
}

function normalizeRegisterRequest(request: RegisterRequest): RegisterRequest {
  // A Solana cryptoId IS the base58 Ed25519 public key, so derive the base64
  // publicKey the backend stores and signs over when the caller omits it. The
  // signed payload and request body then carry the same value the backend
  // derives, keeping signature verification byte-identical.
  return {
    ...request,
    username: normalizeHandle(request.username),
    publicKey: request.publicKey ?? cryptoIdToPublicKeyBase64(request.cryptoId),
  };
}

function registrationSignaturePayload(request: RegisterRequest): string {
  return JSON.stringify({
    action: "identity.register",
    fields: {
      // A handle is just a pointer now: registration binds the cryptoId to the
      // public key. Profile fields (bio/name/metadata) live on the wallet's
      // User and are set separately via UsersApi. `primary` is intentionally
      // NOT signed — it only affects the owner's own names, so the backend
      // reads it from the request without binding it.
      cryptoId: request.cryptoId,
      paymentMethods: request.paymentMethods
        ? request.paymentMethods.map(paymentMethodPayload)
        : null,
      publicKey: request.publicKey,
      username: request.username,
    },
  });
}

function paymentMethodPayload(method: PaymentMethod): Record<string, unknown> {
  return {
    network: method.network,
    address: method.address,
    assets: method.assets,
  };
}
