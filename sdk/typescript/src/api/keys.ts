import type { HttpClient } from "../http.js";
import type { KeyBundle, PreKeysRequest, SignedPreKeyRequest } from "../types/index.js";

export class KeysApi {
  constructor(private readonly http: HttpClient) {}

  getBundle(agentId: string): Promise<KeyBundle> {
    return this.http.getAuth<KeyBundle>(`/keys/${encodeURIComponent(agentId)}/bundle`);
  }

  uploadPreKeys(agentId: string, request: PreKeysRequest): Promise<void> {
    return this.http.put<void>(`/keys/${encodeURIComponent(agentId)}/prekeys`, request);
  }

  rotateSignedPreKey(agentId: string, request: SignedPreKeyRequest): Promise<void> {
    return this.http.put<void>(`/keys/${encodeURIComponent(agentId)}/signed-prekey`, request);
  }
}
