import type { HttpClient } from "../http.js";
import type {
  KeyBundle,
  KeyHealth,
  PreKeysRequest,
  SignedPreKeyRequest,
} from "../types/index.js";

export class KeysApi {
  constructor(private readonly http: HttpClient) {}

  getBundle(agentId: string): Promise<KeyBundle> {
    return this.http.get<KeyBundle>(
      `/keys/${encodeURIComponent(agentId)}/bundle`,
    );
  }

  health(agentId: string): Promise<KeyHealth> {
    return this.http.getDirectoryAuth<KeyHealth>(
      `/keys/${encodeURIComponent(agentId)}/health`,
    );
  }

  uploadPreKeys(agentId: string, request: PreKeysRequest): Promise<void> {
    return this.http.putDirectoryAuth<void>(
      `/keys/${encodeURIComponent(agentId)}/prekeys`,
      request,
    );
  }

  rotateSignedPreKey(
    agentId: string,
    request: SignedPreKeyRequest,
  ): Promise<void> {
    return this.http.putDirectoryAuth<void>(
      `/keys/${encodeURIComponent(agentId)}/signed-prekey`,
      request,
    );
  }
}
