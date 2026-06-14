// Jobs marketplace types — a hiring layer over escrow. See the backend spec
// docs/spec/jobs-marketplace.md.

export type JobStatus =
  | "open"
  | "contracted"
  | "disputed"
  | "completed"
  | "refunded"
  | "cancelled"
  | "expired";

export type ProposalStatus =
  | "submitted"
  | "shortlisted"
  | "selected"
  | "rejected"
  | "withdrawn";

export type DisputeOutcome = "award_provider" | "refund_client" | "partial";

export interface JobBudget {
  amount: string;
  asset: string;
  chain?: string;
}

export interface JobOnChain {
  vault?: string;
  jobPdaCommit?: string;
  fundingTxSig?: string;
}

export interface JobDisputeVote {
  model: string;
  outcome: DisputeOutcome;
  splitBps: number;
  reasoning?: string;
  error?: string;
}

export interface JobDispute {
  reason: string;
  openedBy: string;
  openedAt: string;
  status: "open" | "resolved";
  outcome?: DisputeOutcome;
  splitBps?: number;
  judgeModel?: string;
  presided?: boolean;
  reasoning?: string;
  jury?: Array<JobDisputeVote>;
  resolvedAt?: string;
}

export interface JobPosting {
  jobId: string;
  client: string;
  title: string;
  description: string;
  category?: string;
  skills?: Array<string>;
  budget: JobBudget;
  status: JobStatus;
  proposalCount: number;
  groupId?: string;
  contractEscrowId?: string;
  selectedCandidate?: string;
  dispute?: JobDispute;
  onChain?: JobOnChain;
  proposalDeadline?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Proposal {
  proposalId: string;
  jobId: string;
  candidate: string;
  coverLetter: string;
  bidAmount: string;
  estimatedDelivery?: string;
  pastWork?: Array<string>;
  status: ProposalStatus;
  createdAt: string;
  updatedAt: string;
}

export interface JobCreateRequest {
  client: string;
  title: string;
  description?: string;
  category?: string;
  skills?: Array<string>;
  budget: JobBudget;
  onChain?: JobOnChain;
  proposalDeadline?: string;
}

export interface ProposalCreateRequest {
  candidate: string;
  coverLetter?: string;
  bidAmount?: string;
  estimatedDelivery?: string;
  pastWork?: Array<string>;
}

export interface JobQueryParams {
  client?: string;
  status?: JobStatus;
  category?: string;
  skill?: string;
  limit?: number;
  offset?: number;
}

export interface SelectCandidateResult {
  job: JobPosting;
  contractEscrowId: string;
}
