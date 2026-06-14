import type { HttpClient } from "../http.js";
import type {
  JobCreateRequest,
  JobPosting,
  JobQueryParams,
  Proposal,
  ProposalCreateRequest,
  SelectCandidateResult,
} from "../types/index.js";

// JobsApi covers the jobs marketplace: post + fund, browse, apply, candidate
// selection (which spawns the escrow contract), and the AI-judged dispute flow.
export class JobsApi {
  constructor(private readonly http: HttpClient) {}

  // --- Postings ---

  list(params?: JobQueryParams): Promise<{ jobs: Array<JobPosting> }> {
    return this.http.get<{ jobs: Array<JobPosting> }>(
      "/jobs",
      params as Record<string, unknown>,
    );
  }

  get(jobId: string): Promise<JobPosting> {
    return this.http.get<JobPosting>(`/jobs/${encodeURIComponent(jobId)}`);
  }

  create(request: JobCreateRequest): Promise<JobPosting> {
    return this.http.postDirectoryAuthAs<JobPosting>(
      "/jobs",
      request.client,
      request,
    );
  }

  cancel(jobId: string, actor: string): Promise<JobPosting> {
    return this.http.postDirectoryAuthAs<JobPosting>(
      `/jobs/${encodeURIComponent(jobId)}/cancel`,
      actor,
      { actor },
    );
  }

  // --- Proposals ---

  apply(jobId: string, request: ProposalCreateRequest): Promise<Proposal> {
    return this.http.postDirectoryAuthAs<Proposal>(
      `/jobs/${encodeURIComponent(jobId)}/proposals`,
      request.candidate,
      request,
    );
  }

  // listProposals is restricted to the posting's client.
  listProposals(
    jobId: string,
    client: string,
    params?: { status?: string; limit?: number; offset?: number },
  ): Promise<{ proposals: Array<Proposal> }> {
    return this.http.getDirectoryAuthAs<{ proposals: Array<Proposal> }>(
      `/jobs/${encodeURIComponent(jobId)}/proposals`,
      client,
      params as Record<string, unknown>,
    );
  }

  getProposal(
    jobId: string,
    proposalId: string,
    actor: string,
  ): Promise<Proposal> {
    return this.http.getDirectoryAuthAs<Proposal>(
      `/jobs/${encodeURIComponent(jobId)}/proposals/${encodeURIComponent(proposalId)}`,
      actor,
    );
  }

  shortlistProposal(
    jobId: string,
    proposalId: string,
    client: string,
  ): Promise<Proposal> {
    return this.http.postDirectoryAuthAs<Proposal>(
      `/jobs/${encodeURIComponent(jobId)}/proposals/${encodeURIComponent(proposalId)}/shortlist`,
      client,
      { actor: client },
    );
  }

  withdrawProposal(
    jobId: string,
    proposalId: string,
    candidate: string,
  ): Promise<Proposal> {
    return this.http.postDirectoryAuthAs<Proposal>(
      `/jobs/${encodeURIComponent(jobId)}/proposals/${encodeURIComponent(proposalId)}/withdraw`,
      candidate,
      { actor: candidate },
    );
  }

  // --- Selection (spawns the escrow contract) ---

  select(
    jobId: string,
    client: string,
    proposalId: string,
    network?: string,
  ): Promise<SelectCandidateResult> {
    return this.http.postDirectoryAuthAs<SelectCandidateResult>(
      `/jobs/${encodeURIComponent(jobId)}/select`,
      client,
      { actor: client, proposalId, network },
    );
  }

  // --- Disputes (AI judge panel) ---

  openDispute(
    jobId: string,
    actor: string,
    reason: string,
  ): Promise<JobPosting> {
    return this.http.postDirectoryAuthAs<JobPosting>(
      `/jobs/${encodeURIComponent(jobId)}/dispute`,
      actor,
      { actor, reason },
    );
  }

  // adjudicateDispute convenes the AI judge panel and applies its verdict.
  adjudicateDispute(jobId: string, actor: string): Promise<JobPosting> {
    return this.http.postDirectoryAuthAs<JobPosting>(
      `/jobs/${encodeURIComponent(jobId)}/dispute/adjudicate`,
      actor,
      { actor },
    );
  }
}
