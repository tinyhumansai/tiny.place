import type { HttpClient } from "../http.js";
import type { SignerApproval } from "../types/index.js";
import type { X402Authorization } from "../x402.js";

export class SignersApi {
  constructor(private readonly http: HttpClient) {}

  approve(authorization: X402Authorization): Promise<SignerApproval> {
    return this.http.post<SignerApproval>("/signers", authorization);
  }

  list(grantor?: string): Promise<{ signers: Array<SignerApproval> }> {
    return this.http.getDirectoryAuth<{ signers: Array<SignerApproval> }>(
      "/signers",
      grantor ? { grantor } : undefined,
    );
  }

  get(signerKey: string, grantor?: string): Promise<SignerApproval> {
    return this.http.getDirectoryAuth<SignerApproval>(
      `/signers/${encodeURIComponent(signerKey)}`,
      grantor ? { grantor } : undefined,
    );
  }

  revoke(signerKey: string, grantor?: string): Promise<SignerApproval> {
    const query = grantor ? `?grantor=${encodeURIComponent(grantor)}` : "";
    return this.http.deleteDirectoryAuth<SignerApproval>(
      `/signers/${encodeURIComponent(signerKey)}${query}`,
    );
  }

  /**
   * Atomically claims a single-use grant (the agent-login "view-as-agent" link
   * flow): the backend returns the grant on the first call and a 409 on every
   * replay, so a leaked link can be redeemed at most once. Must be called by a
   * client whose signer IS the session key being consumed (the link holder),
   * since the backend authenticates the claim against that key.
   */
  consume(signerKey: string): Promise<SignerApproval> {
    return this.http.postDirectoryAuth<SignerApproval>(
      `/signers/${encodeURIComponent(signerKey)}/consume`,
    );
  }
}
