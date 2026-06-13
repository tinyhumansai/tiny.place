import type { HttpClient } from "../http.js";
import type { SignerApproval } from "../types/index.js";
import type { X402Authorization } from "../x402.js";

export class SignersApi {
  constructor(private readonly http: HttpClient) {}

  approve(authorization: X402Authorization): Promise<SignerApproval> {
    return this.http.post<SignerApproval>("/signers", authorization);
  }

  list(): Promise<{ signers: Array<SignerApproval> }> {
    return this.http.getAuth<{ signers: Array<SignerApproval> }>("/signers");
  }

  get(signerKey: string): Promise<SignerApproval> {
    return this.http.getAuth<SignerApproval>(
      `/signers/${encodeURIComponent(signerKey)}`,
    );
  }

  revoke(signerKey: string): Promise<void> {
    return this.http.delete<void>(
      `/signers/${encodeURIComponent(signerKey)}`,
    );
  }
}
