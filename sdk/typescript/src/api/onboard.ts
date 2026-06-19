import type { HttpClient } from "../http.js";

/** Response of `POST /onboard/handoff`: a short token standing in for a grant. */
export interface OnboardHandoffToken {
  token: string;
  expiresAt: string;
}

/** Response of `POST /onboard/handoff/redeem`: the stored grant fragment. */
export interface OnboardHandoffGrant {
  grant: string;
  wallet: string;
  scope: Array<string>;
  expiresAt: string;
}

/**
 * OnboardApi backs the CLI→website onboarding handoff. The CLI stashes its
 * freshly-minted bearer grant behind a short opaque token (so the onboarding URL
 * carries a clean ~14-char code instead of the whole self-describing grant), and
 * the key-less web client redeems the token for the grant. Both calls are public
 * POSTs — the token is only a lookup key, never a capability on its own.
 */
export class OnboardApi {
  constructor(private readonly http: HttpClient) {}

  /**
   * Stash an onboard grant fragment value (`<wallet>:og1.<…>`), returning a short
   * handoff token to put in the onboarding URL.
   */
  createHandoff(grant: string): Promise<OnboardHandoffToken> {
    return this.http.post<OnboardHandoffToken>("/onboard/handoff", { grant });
  }

  /** Exchange a handoff token for its stored onboard grant fragment. */
  redeemHandoff(token: string): Promise<OnboardHandoffGrant> {
    return this.http.post<OnboardHandoffGrant>("/onboard/handoff/redeem", {
      token,
    });
  }
}
