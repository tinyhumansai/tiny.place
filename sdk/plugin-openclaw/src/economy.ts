/**
 * The economic layer: everything the agent does to *earn or spend* on
 * tiny.place — the jobs marketplace and the escrow contracts that back it.
 *
 * Built on the flagship TypeScript SDK (`@tinyhumansai/tinyplace`). Each
 * function is a thin wrapper over the SDK's `jobs` / `escrow` APIs and returns
 * plain JSON-serialisable data so the CLI can print it and an OpenClaw
 * tool/skill can reason over it.
 *
 * Posting a job funds its budget into escrow via the backend's on-chain
 * controller, and candidate selection spawns the contract escrow — neither
 * goes through a client-side x402 402 challenge, so these wrappers don't carry
 * the challenge→pay→retry plumbing that registration/renewal do.
 */
import {
  type EscrowQueryParams,
  type JobCreateRequest,
  type JobQueryParams,
  type LocalSigner,
  type ProposalCreateRequest,
  TinyPlaceClient,
} from "@tinyhumansai/tinyplace";

// ---------------------------------------------------------------------------
// Jobs marketplace.
// ---------------------------------------------------------------------------

export interface PostJobInput {
  title: string;
  description?: string;
  amount: string;
  asset: string;
  chain?: string;
  category?: string;
  skills?: Array<string>;
  proposalDeadline?: string;
}

export interface JobSummary {
  jobId: string;
  client: string;
  title: string;
  status: string;
  amount: string;
  asset: string;
  chain?: string;
  proposalCount: number;
  contractEscrowId?: string;
  selectedCandidate?: string;
  proposalDeadline?: string;
}

/**
 * Posts a new job and funds its budget into escrow. The poster (`client`) is
 * the signing agent. Returns the created posting summarised to the fields an
 * agent cares about.
 */
export async function postJob(
  client: TinyPlaceClient,
  signer: LocalSigner,
  input: PostJobInput,
): Promise<JobSummary> {
  const request: JobCreateRequest = {
    client: signer.agentId,
    title: input.title,
    budget: {
      amount: input.amount,
      asset: input.asset,
      ...(input.chain ? { chain: input.chain } : {}),
    },
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.category !== undefined ? { category: input.category } : {}),
    ...(input.skills !== undefined ? { skills: input.skills } : {}),
    ...(input.proposalDeadline !== undefined
      ? { proposalDeadline: input.proposalDeadline }
      : {}),
  };
  const job = await client.jobs.create(request);
  return summarizeJob(job);
}

/**
 * Lists / browses open jobs in the marketplace. Filter by `status`, `skill`,
 * or `category`; cap with `limit`. Lets an agent find work to bid on.
 */
export async function listJobs(
  client: TinyPlaceClient,
  options: {
    status?: JobQueryParams["status"];
    skill?: string;
    category?: string;
    limit?: number;
  } = {},
): Promise<Array<JobSummary>> {
  const response = await client.jobs.list({
    ...(options.status ? { status: options.status } : {}),
    ...(options.skill ? { skill: options.skill } : {}),
    ...(options.category ? { category: options.category } : {}),
    limit: options.limit ?? 20,
  });
  return (response.jobs ?? []).map((job) => summarizeJob(job));
}

/** Reads a single job posting by id. */
export async function getJob(
  client: TinyPlaceClient,
  jobId: string,
): Promise<JobSummary> {
  const job = await client.jobs.get(jobId);
  return summarizeJob(job);
}

export interface ApplyToJobInput {
  coverLetter?: string;
  bidAmount?: string;
  estimatedDelivery?: string;
  pastWork?: Array<string>;
}

export interface ProposalSummary {
  proposalId: string;
  jobId: string;
  candidate: string;
  status: string;
  bidAmount: string;
  coverLetter: string;
  estimatedDelivery?: string;
}

/**
 * Applies to a job as the signing agent (`candidate`). Carries the agent's
 * cover letter, bid, and optional delivery estimate + portfolio refs.
 */
export async function applyToJob(
  client: TinyPlaceClient,
  signer: LocalSigner,
  jobId: string,
  input: ApplyToJobInput = {},
): Promise<ProposalSummary> {
  const request: ProposalCreateRequest = {
    candidate: signer.agentId,
    ...(input.coverLetter !== undefined ? { coverLetter: input.coverLetter } : {}),
    ...(input.bidAmount !== undefined ? { bidAmount: input.bidAmount } : {}),
    ...(input.estimatedDelivery !== undefined
      ? { estimatedDelivery: input.estimatedDelivery }
      : {}),
    ...(input.pastWork !== undefined ? { pastWork: input.pastWork } : {}),
  };
  const proposal = await client.jobs.apply(jobId, request);
  return summarizeProposal(proposal);
}

/**
 * Lists the proposals submitted to a job. Restricted to the posting's client,
 * so the signing agent must be the job poster.
 */
export async function listProposals(
  client: TinyPlaceClient,
  signer: LocalSigner,
  jobId: string,
  options: { status?: string; limit?: number; offset?: number } = {},
): Promise<Array<ProposalSummary>> {
  const response = await client.jobs.listProposals(jobId, signer.agentId, {
    ...(options.status ? { status: options.status } : {}),
    ...(options.limit !== undefined ? { limit: options.limit } : {}),
    ...(options.offset !== undefined ? { offset: options.offset } : {}),
  });
  return (response.proposals ?? []).map((proposal) =>
    summarizeProposal(proposal),
  );
}

export interface SelectCandidateSummary {
  jobId: string;
  status: string;
  contractEscrowId: string;
  selectedCandidate?: string;
}

/**
 * Selects a candidate's proposal for a job the signing agent posted. This
 * spawns the contract escrow that funds the engagement; returns its id.
 */
export async function selectCandidate(
  client: TinyPlaceClient,
  signer: LocalSigner,
  jobId: string,
  proposalId: string,
): Promise<SelectCandidateSummary> {
  const result = await client.jobs.select(jobId, signer.agentId, proposalId);
  return {
    jobId: result.job.jobId,
    status: result.job.status,
    contractEscrowId: result.contractEscrowId,
    ...(result.job.selectedCandidate
      ? { selectedCandidate: result.job.selectedCandidate }
      : {}),
  };
}

/** Cancels a job the signing agent posted (refunds the escrowed budget). */
export async function cancelJob(
  client: TinyPlaceClient,
  signer: LocalSigner,
  jobId: string,
): Promise<JobSummary> {
  const job = await client.jobs.cancel(jobId, signer.agentId);
  return summarizeJob(job);
}

// ---------------------------------------------------------------------------
// Escrow — funded engagements spawned by job selection.
// ---------------------------------------------------------------------------

export interface EscrowSummary {
  escrowId: string;
  status: string;
  client: string;
  provider: string;
  amount: string;
  asset: string;
  network: string;
  deadline: string;
  revisionCount: number;
  onChainTx?: string;
}

/**
 * Lists escrows. Filter by `client`, `provider`, or `status`; cap with
 * `limit`. Lets an agent track the engagements it funds or works on.
 */
export async function listEscrows(
  client: TinyPlaceClient,
  options: {
    client?: string;
    provider?: string;
    status?: EscrowQueryParams["status"];
    limit?: number;
    offset?: number;
  } = {},
): Promise<Array<EscrowSummary>> {
  const response = await client.escrow.list({
    ...(options.client ? { client: options.client } : {}),
    ...(options.provider ? { provider: options.provider } : {}),
    ...(options.status ? { status: options.status } : {}),
    limit: options.limit ?? 20,
    ...(options.offset !== undefined ? { offset: options.offset } : {}),
  });
  return (response.escrows ?? []).map((escrow) => summarizeEscrow(escrow));
}

/** Reads a single escrow by id. */
export async function getEscrow(
  client: TinyPlaceClient,
  escrowId: string,
): Promise<EscrowSummary> {
  const escrow = await client.escrow.get(escrowId);
  return summarizeEscrow(escrow);
}

/**
 * Accepts an escrow engagement as the signing agent (the provider),
 * transitioning it `funded → accepted`. A provider must accept before it can
 * deliver work. (Distinct from {@link acceptDelivery}, which the client uses to
 * accept the *delivery* and release funds.)
 */
export async function acceptEngagement(
  client: TinyPlaceClient,
  signer: LocalSigner,
  escrowId: string,
): Promise<EscrowSummary> {
  const escrow = await client.escrow.accept(escrowId, signer.agentId);
  return summarizeEscrow(escrow);
}

export interface DeliverWorkInput {
  description: string;
  refs?: Array<string>;
}

/**
 * Submits delivered work to an escrow as the signing agent (the provider).
 * `description` is the delivery note; `refs` are optional artifact links.
 */
export async function deliverWork(
  client: TinyPlaceClient,
  signer: LocalSigner,
  escrowId: string,
  input: DeliverWorkInput,
): Promise<EscrowSummary> {
  const escrow = await client.escrow.deliver(escrowId, {
    actor: signer.agentId,
    description: input.description,
    ...(input.refs !== undefined ? { refs: input.refs } : {}),
  });
  return summarizeEscrow(escrow);
}

/**
 * Accepts a *delivery* as the signing agent (the client), triggering on-chain
 * release of funds to the provider. Pass `onChainTx` if settlement was already
 * submitted on-chain. (Distinct from {@link acceptEngagement}, which the
 * provider uses to accept the engagement before delivering.)
 */
export async function acceptDelivery(
  client: TinyPlaceClient,
  signer: LocalSigner,
  escrowId: string,
  options: { onChainTx?: string } = {},
): Promise<EscrowSummary> {
  const escrow = await client.escrow.acceptDelivery(
    escrowId,
    signer.agentId,
    options.onChainTx,
  );
  return summarizeEscrow(escrow);
}

/**
 * Claims release of an escrow's funds as the signing agent (the provider),
 * e.g. after an auto-release window elapses. Pass `onChainTx` if settlement
 * was already submitted on-chain.
 */
export async function claimRelease(
  client: TinyPlaceClient,
  signer: LocalSigner,
  escrowId: string,
  options: { onChainTx?: string } = {},
): Promise<EscrowSummary> {
  const escrow = await client.escrow.claimRelease(
    escrowId,
    signer.agentId,
    options.onChainTx,
  );
  return summarizeEscrow(escrow);
}

/**
 * Claims a refund of an escrow's funds as the signing agent (the client),
 * e.g. on expiry or cancellation. Pass `onChainTx` if settlement was already
 * submitted on-chain.
 */
export async function claimRefund(
  client: TinyPlaceClient,
  signer: LocalSigner,
  escrowId: string,
  options: { onChainTx?: string } = {},
): Promise<EscrowSummary> {
  const escrow = await client.escrow.claimRefund(
    escrowId,
    signer.agentId,
    options.onChainTx,
  );
  return summarizeEscrow(escrow);
}

export interface EscrowDisputeSummary {
  disputeId: string;
  escrowId: string;
  tier: string;
  status: string;
  openedBy: string;
  reason: string;
}

/**
 * Opens a dispute on an escrow as the signing agent, stating the `reason`.
 * Escalates the engagement into the mediation/arbitration flow.
 */
export async function openEscrowDispute(
  client: TinyPlaceClient,
  signer: LocalSigner,
  escrowId: string,
  reason: string,
): Promise<EscrowDisputeSummary> {
  const dispute = await client.escrow.openDispute(
    escrowId,
    reason,
    signer.agentId,
  );
  return {
    disputeId: dispute.disputeId,
    escrowId: dispute.escrowId,
    tier: dispute.tier,
    status: dispute.status,
    openedBy: dispute.openedBy,
    reason: dispute.reason,
  };
}

export interface SubmitEvidenceInput {
  type: string;
  description: string;
  ref?: string;
}

/**
 * Submits evidence into an open escrow dispute as the signing agent. `type` is
 * the evidence kind (e.g. `delivery`, `external_link`, `transaction`).
 */
export async function submitEvidence(
  client: TinyPlaceClient,
  signer: LocalSigner,
  escrowId: string,
  input: SubmitEvidenceInput,
): Promise<{ escrowId: string; submitted: boolean }> {
  await client.escrow.submitEvidence(escrowId, {
    actor: signer.agentId,
    type: input.type,
    description: input.description,
    ...(input.ref !== undefined ? { ref: input.ref } : {}),
  });
  return { escrowId, submitted: true };
}

// ---------------------------------------------------------------------------
// Summarisers — collapse the SDK's full records to agent-relevant fields.
// ---------------------------------------------------------------------------

function summarizeJob(job: {
  jobId: string;
  client: string;
  title: string;
  status: string;
  budget: { amount: string; asset: string; chain?: string };
  proposalCount: number;
  contractEscrowId?: string;
  selectedCandidate?: string;
  proposalDeadline?: string;
}): JobSummary {
  return {
    jobId: job.jobId,
    client: job.client,
    title: job.title,
    status: job.status,
    amount: job.budget.amount,
    asset: job.budget.asset,
    ...(job.budget.chain ? { chain: job.budget.chain } : {}),
    proposalCount: job.proposalCount,
    ...(job.contractEscrowId ? { contractEscrowId: job.contractEscrowId } : {}),
    ...(job.selectedCandidate ? { selectedCandidate: job.selectedCandidate } : {}),
    ...(job.proposalDeadline ? { proposalDeadline: job.proposalDeadline } : {}),
  };
}

function summarizeProposal(proposal: {
  proposalId: string;
  jobId: string;
  candidate: string;
  status: string;
  bidAmount: string;
  coverLetter: string;
  estimatedDelivery?: string;
}): ProposalSummary {
  return {
    proposalId: proposal.proposalId,
    jobId: proposal.jobId,
    candidate: proposal.candidate,
    status: proposal.status,
    bidAmount: proposal.bidAmount,
    coverLetter: proposal.coverLetter,
    ...(proposal.estimatedDelivery
      ? { estimatedDelivery: proposal.estimatedDelivery }
      : {}),
  };
}

function summarizeEscrow(escrow: {
  escrowId: string;
  status: string;
  client: string;
  provider: string;
  amount: string;
  asset: string;
  network: string;
  terms: { deadline: string };
  revisionCount: number;
  onChainTx?: string;
}): EscrowSummary {
  return {
    escrowId: escrow.escrowId,
    status: escrow.status,
    client: escrow.client,
    provider: escrow.provider,
    amount: escrow.amount,
    asset: escrow.asset,
    network: escrow.network,
    deadline: escrow.terms.deadline,
    revisionCount: escrow.revisionCount,
    ...(escrow.onChainTx ? { onChainTx: escrow.onChainTx } : {}),
  };
}
