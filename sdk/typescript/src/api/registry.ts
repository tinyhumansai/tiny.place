import type { SigningKey } from "../auth.js";
import { signCanonicalPayload } from "../auth.js";
import { canonicalPayload } from "../crypto.js";
import type { HttpClient } from "../http.js";
import type {
  AvailabilityResponse,
  Identity,
  IdentityClaimRequest,
  IdentityExport,
  IdentityMetadata,
  IdentityProfileUpdate,
  LedgerTransaction,
  PaymentMethod,
  ProfileVisibilityUpdate,
  RenewalRequest,
  Subname,
  SubnameCreateRequest,
} from "../types/index.js";

export interface RegisterRequest {
  username: string;
  bio: string;
  cryptoId: string;
  publicKey: string;
  paymentMethods?: Array<PaymentMethod>;
  metadata?: IdentityMetadata;
  payment?: Record<string, string>;
}

export class RegistryApi {
  constructor(
    private readonly http: HttpClient,
    private readonly signingKey?: SigningKey,
  ) {}

  async register(request: RegisterRequest): Promise<Identity> {
    let signature: string | undefined;
    if (this.signingKey && !request.payment) {
      const payload = canonicalPayload("identity.register", {
        bio: request.bio,
        cryptoId: request.cryptoId,
        metadata: request.metadata,
        paymentMethods: request.paymentMethods,
        publicKey: request.publicKey,
        username: request.username,
      });
      signature = await signCanonicalPayload(this.signingKey, payload);
    }

    return this.http.postPublic<Identity>("/registry/names", {
      ...request,
      ...(signature ? { signature } : {}),
    });
  }

  get(name: string): Promise<AvailabilityResponse> {
    return this.http.get<AvailabilityResponse>(`/registry/names/${encodeURIComponent(name)}`);
  }

  export(name: string): Promise<IdentityExport> {
    return this.http.get<IdentityExport>(`/registry/names/${encodeURIComponent(name)}/export`);
  }

  async updateProfile(name: string, update: IdentityProfileUpdate): Promise<Identity> {
    if (this.signingKey && !update.signature) {
      const payload = canonicalPayload("identity.profile", {
        bio: update.bio,
        metadata: update.metadata,
        username: name,
      });
      update = { ...update, signature: await signCanonicalPayload(this.signingKey, payload) };
    }
    return this.http.put<Identity>(
      `/registry/names/${encodeURIComponent(name)}/profile`,
      update,
    );
  }

  updateProfileVisibility(name: string, update: ProfileVisibilityUpdate): Promise<Identity> {
    return this.http.put<Identity>(
      `/registry/names/${encodeURIComponent(name)}/profile-visibility`,
      update,
    );
  }

  async renew(name: string, request: RenewalRequest): Promise<LedgerTransaction> {
    if (this.signingKey && !request.signature) {
      const payload = canonicalPayload("identity.renew", { username: name });
      request = { ...request, signature: await signCanonicalPayload(this.signingKey, payload) };
    }
    return this.http.post<LedgerTransaction>(
      `/registry/names/${encodeURIComponent(name)}/renew`,
      request,
    );
  }

  async claim(name: string, request: IdentityClaimRequest): Promise<LedgerTransaction> {
    if (this.signingKey && !request.signature) {
      const payload = canonicalPayload("identity.claim", {
        cryptoId: request.cryptoId,
        publicKey: request.publicKey,
        username: name,
      });
      request = { ...request, signature: await signCanonicalPayload(this.signingKey, payload) };
    }
    return this.http.post<LedgerTransaction>(
      `/registry/names/${encodeURIComponent(name)}/claim`,
      request,
    );
  }

  async createSubname(name: string, request: SubnameCreateRequest): Promise<Subname> {
    if (this.signingKey && !request.signature) {
      const payload = canonicalPayload("identity.subname.create", {
        bio: request.bio,
        subname: request.subname,
        target: request.target,
        username: name,
      });
      request = { ...request, signature: await signCanonicalPayload(this.signingKey, payload) };
    }
    return this.http.post<Subname>(
      `/registry/names/${encodeURIComponent(name)}/subnames`,
      request,
    );
  }

  async deleteSubname(name: string, subname: string): Promise<void> {
    let body: Record<string, string> | undefined;
    if (this.signingKey) {
      const payload = canonicalPayload("identity.subname.delete", {
        subname,
        username: name,
      });
      body = { signature: await signCanonicalPayload(this.signingKey, payload) };
    }
    return this.http.delete<void>(
      `/registry/names/${encodeURIComponent(name)}/subnames/${encodeURIComponent(subname)}`,
      body,
    );
  }
}
