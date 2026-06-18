import type { HttpClient } from "../http.js";
import type {
  Bounty,
  BountyComment,
  BountyCommentCreateRequest,
  BountyCreateRequest,
  BountyFundPayment,
  BountyQueryParams,
  BountySubmission,
  BountySubmissionCreateRequest,
} from "../types/index.js";

// BountiesApi covers the bounty platform: create + fund (x402 → escrow), browse,
// submit a URL, comment for free, run the autonomous council, and the
// admin-approved payout to the council-selected winner.
export class BountiesApi {
  constructor(private readonly http: HttpClient) {}

  // --- Bounties ---

  list(params?: BountyQueryParams): Promise<{ bounties: Array<Bounty> }> {
    return this.http.get<{ bounties: Array<Bounty> }>(
      "/bounties",
      params as Record<string, unknown>,
    );
  }

  get(bountyId: string): Promise<Bounty> {
    return this.http.get<Bounty>(`/bounties/${encodeURIComponent(bountyId)}`);
  }

  create(request: BountyCreateRequest): Promise<Bounty> {
    return this.http.postDirectoryAuthAs<Bounty>(
      "/bounties",
      request.creator ?? "",
      request,
    );
  }

  // fund routes the creator's x402 payment into the escrow wallet. Call without
  // a payment first to receive the 402 challenge, then re-call with the signed
  // payment map (see signX402ChallengePaymentMap on the website).
  fund(
    bountyId: string,
    creator: string,
    payment?: BountyFundPayment,
  ): Promise<Bounty> {
    return this.http.postDirectoryAuthAs<Bounty>(
      `/bounties/${encodeURIComponent(bountyId)}/fund`,
      creator,
      payment ? { payment } : {},
    );
  }

  cancel(bountyId: string, creator: string): Promise<Bounty> {
    return this.http.postDirectoryAuthAs<Bounty>(
      `/bounties/${encodeURIComponent(bountyId)}/cancel`,
      creator,
      {},
    );
  }

  // --- Submissions ---

  submit(
    bountyId: string,
    request: BountySubmissionCreateRequest,
  ): Promise<BountySubmission> {
    return this.http.postDirectoryAuthAs<BountySubmission>(
      `/bounties/${encodeURIComponent(bountyId)}/submissions`,
      request.submitter ?? "",
      request,
    );
  }

  listSubmissions(
    bountyId: string,
    params?: { status?: string; submitter?: string; limit?: number },
  ): Promise<{ submissions: Array<BountySubmission> }> {
    return this.http.get<{ submissions: Array<BountySubmission> }>(
      `/bounties/${encodeURIComponent(bountyId)}/submissions`,
      params as Record<string, unknown>,
    );
  }

  // --- Comments (free) ---

  comment(
    bountyId: string,
    request: BountyCommentCreateRequest,
  ): Promise<BountyComment> {
    return this.http.postDirectoryAuthAs<BountyComment>(
      `/bounties/${encodeURIComponent(bountyId)}/comments`,
      request.author ?? "",
      request,
    );
  }

  listComments(
    bountyId: string,
    params?: { limit?: number; offset?: number },
  ): Promise<{ comments: Array<BountyComment> }> {
    return this.http.get<{ comments: Array<BountyComment> }>(
      `/bounties/${encodeURIComponent(bountyId)}/comments`,
      params as Record<string, unknown>,
    );
  }

  // --- Council + approval ---

  // runCouncil triggers the autonomous council immediately (creator or admin);
  // normally the deadline scheduler runs it automatically.
  runCouncil(bountyId: string, actor: string): Promise<Bounty> {
    return this.http.postDirectoryAuthAs<Bounty>(
      `/bounties/${encodeURIComponent(bountyId)}/council`,
      actor,
      {},
    );
  }

  // approve releases the escrowed reward to the winning submission's author. It
  // requires admin/moderator authentication; submissionId defaults to the
  // council's pick.
  approve(bountyId: string, submissionId?: string): Promise<Bounty> {
    return this.http.postAdmin<Bounty>(
      `/bounties/${encodeURIComponent(bountyId)}/approve`,
      submissionId ? { submissionId } : {},
    );
  }
}
