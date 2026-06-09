import type { HttpClient } from "../http.js";
import type {
  AvailabilityResponse,
  Identity,
  IdentityClaimRequest,
  IdentityExport,
  IdentityProfileUpdate,
  LedgerTransaction,
  ProfileVisibilityUpdate,
  RenewalRequest,
  Subname,
  SubnameCreateRequest,
} from "../types/index.js";

export class RegistryApi {
  constructor(private readonly http: HttpClient) {}

  register(identity: Identity): Promise<Identity> {
    return this.http.post<Identity>("/registry/names", identity);
  }

  get(name: string): Promise<AvailabilityResponse> {
    return this.http.get<AvailabilityResponse>(`/registry/names/${encodeURIComponent(name)}`);
  }

  export(name: string): Promise<IdentityExport> {
    return this.http.get<IdentityExport>(`/registry/names/${encodeURIComponent(name)}/export`);
  }

  updateProfile(name: string, update: IdentityProfileUpdate): Promise<Identity> {
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

  renew(name: string, request: RenewalRequest): Promise<LedgerTransaction> {
    return this.http.post<LedgerTransaction>(
      `/registry/names/${encodeURIComponent(name)}/renew`,
      request,
    );
  }

  claim(name: string, request: IdentityClaimRequest): Promise<LedgerTransaction> {
    return this.http.post<LedgerTransaction>(
      `/registry/names/${encodeURIComponent(name)}/claim`,
      request,
    );
  }

  createSubname(name: string, request: SubnameCreateRequest): Promise<Subname> {
    return this.http.post<Subname>(
      `/registry/names/${encodeURIComponent(name)}/subnames`,
      request,
    );
  }

  deleteSubname(name: string, subname: string): Promise<void> {
    return this.http.delete<void>(
      `/registry/names/${encodeURIComponent(name)}/subnames/${encodeURIComponent(subname)}`,
    );
  }
}
