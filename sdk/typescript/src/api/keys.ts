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
    return this.http.get<KeyBundle>(keyPath(agentId, "bundle"));
  }

  health(agentId: string): Promise<KeyHealth> {
    return this.http.getDirectoryAuthAs<KeyHealth>(
      keyPath(agentId, "health"),
      agentId,
    );
  }

  uploadPreKeys(agentId: string, request: PreKeysRequest): Promise<void> {
    return this.http.putDirectoryAuthAs<void>(
      keyPath(agentId, "prekeys"),
      agentId,
      request,
    );
  }

  rotateSignedPreKey(
    agentId: string,
    request: SignedPreKeyRequest,
  ): Promise<void> {
    return this.http.putDirectoryAuthAs<void>(
      keyPath(agentId, "signed-prekey"),
      agentId,
      request,
    );
  }
}

function keyPath(agentId: string, suffix: string): string {
  return `/keys/${keyRouteId(agentId)}/${suffix}`;
}

function keyRouteId(agentId: string): string {
  if (looksLikeBase64PublicKey(agentId)) {
    return `by-public-key/${base64ToBase64Url(agentId)}`;
  }
  return encodeURIComponent(agentId);
}

function looksLikeBase64PublicKey(value: string): boolean {
  return (
    value.length >= 40 &&
    /[+/=]/.test(value) &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(value)
  );
}

function base64ToBase64Url(value: string): string {
  return value.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
