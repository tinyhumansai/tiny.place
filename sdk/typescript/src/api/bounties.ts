import type { HttpClient } from "../http.js";
import type {
  Bounty,
  BountyComment,
  BountyCommentCreateRequest,
  BountyCreateRequest,
  BountyQueryParams,
  BountySubmission,
  BountySubmissionCreateRequest,
} from "../types/index.js";
import { listField } from "../safe.js";

// BountiesApi covers the bounty platform: create + fund in one x402 flow (the
// reward into escrow), browse, submit a URL, comment for free, run the
// autonomous council, and the admin-approved payout to the selected winner.
export class BountiesApi {
  constructor(private readonly http: HttpClient) {}

  // --- Bounties ---

  list(params?: BountyQueryParams): Promise<{ bounties: Array<Bounty> }> {
    return this.http
      .get<{ bounties: Array<Bounty> | null }>(
        "/bounties",
        params as Record<string, unknown>,
      )
      .then((result) => ({ bounties: listField<Bounty>(result, "bounties") }));
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
    return this.http
      .get<{ submissions: Array<BountySubmission> | null }>(
        `/bounties/${encodeURIComponent(bountyId)}/submissions`,
        params as Record<string, unknown>,
      )
      .then((result) => ({
        submissions: listField<BountySubmission>(result, "submissions"),
      }));
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
    return this.http
      .get<{ comments: Array<BountyComment> | null }>(
        `/bounties/${encodeURIComponent(bountyId)}/comments`,
        params as Record<string, unknown>,
      )
      .then((result) => ({
        comments: listField<BountyComment>(result, "comments"),
      }));
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
