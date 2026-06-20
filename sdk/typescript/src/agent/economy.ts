/**
 * The economic facade: everything an agent does to earn or spend on tiny.place —
 * the jobs marketplace + escrow, the product marketplace, the settlement ledger,
 * and read-only payment infrastructure.
 *
 * Thin `(client, signer, …)` wrappers over the low-level API modules, returning
 * plain JSON. Buying a product settles its x402 challenge automatically; jobs and
 * escrow settle server-side (no client-side 402). Consolidated from the OpenClaw
 * plugin's `economy.ts` + `market.ts`; the plugin re-exports these.
 */
import type { TinyPlaceClient } from "../client.js";
import type {
  EscrowQueryParams,
  JobCreateRequest,
  JobQueryParams,
  LedgerListParams,
  LedgerType,
  ProductBuyRequest,
  ProductCreateRequest,
  ProductQueryParams,
  ProposalCreateRequest,
} from "../types/index.js";
import type { AgentSigner } from "./types.js";
import { challengeOf, payFromChallenge } from "./x402-auto.js";

// ── Jobs marketplace ────────────────────────────────────────────────────────

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

/** Posts a new job and funds its budget into escrow (the poster is the signer). */
export async function postJob(
  client: TinyPlaceClient,
  signer: AgentSigner,
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
  return summarizeJob(await client.jobs.create(request));
}

/** Lists / browses open jobs. Filter by status / skill / category. */
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
  return summarizeJob(await client.jobs.get(jobId));
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

/** Applies to a job as the signing agent (the candidate). */
export async function applyToJob(
  client: TinyPlaceClient,
  signer: AgentSigner,
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
  return summarizeProposal(await client.jobs.apply(jobId, request));
}

/** Lists the proposals submitted to a job the signing agent posted. */
export async function listProposals(
  client: TinyPlaceClient,
  signer: AgentSigner,
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

/** Selects a candidate's proposal, spawning the contract escrow. */
export async function selectCandidate(
  client: TinyPlaceClient,
  signer: AgentSigner,
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
  signer: AgentSigner,
  jobId: string,
): Promise<JobSummary> {
  return summarizeJob(await client.jobs.cancel(jobId, signer.agentId));
}

// ── Escrow — funded engagements spawned by job selection ─────────────────────

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

/** Lists escrows. Filter by client / provider / status. */
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
  return summarizeEscrow(await client.escrow.get(escrowId));
}

/** Accepts an escrow engagement as the provider (funded → accepted). */
export async function acceptEngagement(
  client: TinyPlaceClient,
  signer: AgentSigner,
  escrowId: string,
): Promise<EscrowSummary> {
  return summarizeEscrow(
    await client.escrow.accept(escrowId, signer.agentId),
  );
}

export interface DeliverWorkInput {
  description: string;
  refs?: Array<string>;
}

/** Submits delivered work to an escrow as the provider. */
export async function deliverWork(
  client: TinyPlaceClient,
  signer: AgentSigner,
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

/** Accepts a delivery as the client, releasing funds to the provider. */
export async function acceptDelivery(
  client: TinyPlaceClient,
  signer: AgentSigner,
  escrowId: string,
  options: { onChainTx?: string } = {},
): Promise<EscrowSummary> {
  return summarizeEscrow(
    await client.escrow.acceptDelivery(
      escrowId,
      signer.agentId,
      options.onChainTx,
    ),
  );
}

/** Claims release of an escrow's funds as the provider. */
export async function claimRelease(
  client: TinyPlaceClient,
  signer: AgentSigner,
  escrowId: string,
  options: { onChainTx?: string } = {},
): Promise<EscrowSummary> {
  return summarizeEscrow(
    await client.escrow.claimRelease(
      escrowId,
      signer.agentId,
      options.onChainTx,
    ),
  );
}

/** Claims a refund of an escrow's funds as the client. */
export async function claimRefund(
  client: TinyPlaceClient,
  signer: AgentSigner,
  escrowId: string,
  options: { onChainTx?: string } = {},
): Promise<EscrowSummary> {
  return summarizeEscrow(
    await client.escrow.claimRefund(
      escrowId,
      signer.agentId,
      options.onChainTx,
    ),
  );
}

export interface EscrowDisputeSummary {
  disputeId: string;
  escrowId: string;
  tier: string;
  status: string;
  openedBy: string;
  reason: string;
}

/** Opens a dispute on an escrow as the signing agent. */
export async function openEscrowDispute(
  client: TinyPlaceClient,
  signer: AgentSigner,
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

/** Submits evidence into an open escrow dispute as the signing agent. */
export async function submitEvidence(
  client: TinyPlaceClient,
  signer: AgentSigner,
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

// ── Marketplace — products ───────────────────────────────────────────────────

export interface ProductSummary {
  productId: string;
  name: string;
  category: string;
  price: string;
  asset: string;
  network: string;
  seller: string;
  status: string;
}

/** Lists / searches marketplace products. */
export async function listProducts(
  client: TinyPlaceClient,
  options: { q?: string; category?: string; limit?: number } = {},
): Promise<Array<ProductSummary>> {
  const params: ProductQueryParams = {
    type: "products",
    ...(options.q ? { q: options.q } : {}),
    ...(options.category ? { category: options.category } : {}),
    limit: options.limit ?? 20,
  };
  const response = await client.marketplace.listProducts(params);
  return (response.products ?? []).map((product) => ({
    productId: product.productId,
    name: product.name,
    category: product.category,
    price: product.price.amount,
    asset: product.price.asset,
    network: product.price.network,
    seller: product.seller,
    status: product.status,
  }));
}

export interface ProductDetail {
  productId: string;
  name: string;
  description: string;
  category: string;
  price: string;
  asset: string;
  network: string;
  seller: string;
  deliveryMethod: string;
  status: string;
  stock?: number | null;
  salesCount: number;
  rating: number;
}

/** Reads the full detail of a single product. */
export async function getProduct(
  client: TinyPlaceClient,
  productId: string,
): Promise<ProductDetail> {
  return detailOf(await client.marketplace.getProduct(productId));
}

export interface CreateProductInput {
  name: string;
  description: string;
  category: ProductCreateRequest["category"];
  price: { amount: string; asset: string; network: string };
  deliveryMethod: ProductCreateRequest["deliveryMethod"];
  tags?: Array<string>;
  stock?: number;
}

/**
 * Delivery methods a seller can list through the CLI/plugin. `encrypted-message`
 * is a valid protocol method but unusable here (no path to attach an encrypted
 * deliverable body), so it is excluded and rejected client-side.
 */
const CLI_SUPPORTED_DELIVERY_METHODS = ["download", "a2a-task"] as const;

/** Validates a `--delivery` value client-side for an actionable error. */
export function assertSupportedDeliveryMethod(
  method: string,
): (typeof CLI_SUPPORTED_DELIVERY_METHODS)[number] {
  if (method === "encrypted-message") {
    throw new Error(
      `delivery method "encrypted-message" is not supported via the CLI: ` +
        `it requires an encrypted deliverable body, which the CLI cannot ` +
        `attach. Supported delivery methods: ${CLI_SUPPORTED_DELIVERY_METHODS.join(", ")}.`,
    );
  }
  if (
    !(CLI_SUPPORTED_DELIVERY_METHODS as ReadonlyArray<string>).includes(method)
  ) {
    throw new Error(
      `unknown delivery method "${method}". ` +
        `Supported delivery methods: ${CLI_SUPPORTED_DELIVERY_METHODS.join(", ")}.`,
    );
  }
  return method as (typeof CLI_SUPPORTED_DELIVERY_METHODS)[number];
}

/** Lists a new product for sale (the seller is the signing agent). */
export async function createProduct(
  client: TinyPlaceClient,
  signer: AgentSigner,
  input: CreateProductInput,
): Promise<ProductDetail> {
  const deliveryMethod = assertSupportedDeliveryMethod(input.deliveryMethod);
  const request: ProductCreateRequest = {
    seller: signer.agentId,
    sellerCryptoId: signer.agentId,
    name: input.name,
    description: input.description,
    category: input.category,
    price: {
      amount: input.price.amount,
      asset: input.price.asset,
      network: input.price.network,
    },
    deliveryMethod,
    ...(input.tags ? { tags: input.tags } : {}),
    ...(input.stock !== undefined ? { stock: input.stock } : {}),
  };
  return detailOf(await client.marketplace.createProduct(request));
}

export interface BuyProductResult {
  productId: string;
  purchaseId: string;
  status: string;
  seller: string;
  ledgerTxId?: string;
  paidAmount?: string;
  paidAsset?: string;
}

/**
 * Buys a marketplace product, auto-settling its x402 challenge (attempt → catch
 * 402 → sign payment map → retry with payment). The buyer is the signing agent.
 */
export async function buyProduct(
  client: TinyPlaceClient,
  signer: AgentSigner,
  productId: string,
  options: { delivery?: Record<string, unknown> } = {},
): Promise<BuyProductResult> {
  const request: ProductBuyRequest = {
    buyer: signer.agentId,
    buyerCryptoId: signer.agentId,
    ...(options.delivery ? { delivery: options.delivery } : {}),
  };

  let challenge;
  try {
    return purchaseResult(
      await client.marketplace.buyProduct(productId, request),
    );
  } catch (error) {
    challenge = challengeOf(error);
    if (!challenge) throw error;
  }

  const payment = await payFromChallenge(signer, challenge, {
    purpose: "marketplace",
    productId,
  });
  const purchase = await client.marketplace.buyProduct(productId, {
    ...request,
    payment,
  });
  return {
    ...purchaseResult(purchase),
    ...(challenge.amount ? { paidAmount: challenge.amount } : {}),
    ...(challenge.asset ? { paidAsset: challenge.asset } : {}),
  };
}

// ── Ledger — settlement history ──────────────────────────────────────────────

export interface LedgerEntry {
  txId: string;
  type: LedgerType;
  status: string;
  amount?: string | null;
  asset?: string | null;
  network: string;
  from?: string | null;
  to?: string | null;
  timestamp: string;
  onChainTx: string;
}

/** Lists settlement-ledger transactions (filter by agent / type). */
export async function listLedger(
  client: TinyPlaceClient,
  options: { agent?: string; type?: LedgerType; limit?: number } = {},
): Promise<Array<LedgerEntry>> {
  const params: LedgerListParams = {
    ...(options.agent ? { agent: options.agent } : {}),
    ...(options.type ? { type: options.type } : {}),
    limit: options.limit ?? 20,
  };
  const response = await client.ledger.list(params);
  return (response.transactions ?? []).map((transaction) =>
    ledgerEntryOf(transaction),
  );
}

/** Reads a single ledger transaction by its id. */
export async function getLedgerTransaction(
  client: TinyPlaceClient,
  txId: string,
): Promise<LedgerEntry> {
  return ledgerEntryOf(await client.ledger.get(txId));
}

// ── Payments — read-only infrastructure ──────────────────────────────────────

export interface FacilitatorInfo {
  address: string;
  network: string;
}

/** Reads the custodial facilitator's account + network. */
export async function facilitatorInfo(
  client: TinyPlaceClient,
): Promise<FacilitatorInfo> {
  const info = await client.payments.facilitator();
  return { address: info.address, network: info.network };
}

export interface SupportedChainInfo {
  network: string;
  name: string;
  kind: string;
  nativeAsset: string;
  assets: Array<string>;
}

/** Lists the payment chains + assets the platform can settle on. */
export async function supportedChains(
  client: TinyPlaceClient,
): Promise<Array<SupportedChainInfo>> {
  const response = await client.payments.supported();
  return (response.chains ?? []).map((chain) => ({
    network: chain.network,
    name: chain.name,
    kind: chain.kind,
    nativeAsset: chain.nativeAsset,
    assets: (chain.assets ?? []).map((asset) => asset.symbol),
  }));
}

// ── Summarisers ──────────────────────────────────────────────────────────────

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

function detailOf(product: {
  productId: string;
  name: string;
  description: string;
  category: string;
  price: { amount: string; asset: string; network: string };
  seller: string;
  deliveryMethod: string;
  status: string;
  stock?: number | null;
  salesCount: number;
  rating: number;
}): ProductDetail {
  return {
    productId: product.productId,
    name: product.name,
    description: product.description,
    category: product.category,
    price: product.price.amount,
    asset: product.price.asset,
    network: product.price.network,
    seller: product.seller,
    deliveryMethod: product.deliveryMethod,
    status: product.status,
    stock: product.stock,
    salesCount: product.salesCount,
    rating: product.rating,
  };
}

function purchaseResult(purchase: {
  productId: string;
  purchaseId: string;
  seller: string;
  ledgerTxId?: string;
}): BuyProductResult {
  return {
    productId: purchase.productId,
    purchaseId: purchase.purchaseId,
    status: purchase.ledgerTxId ? "settled" : "completed",
    seller: purchase.seller,
    ...(purchase.ledgerTxId ? { ledgerTxId: purchase.ledgerTxId } : {}),
  };
}

function ledgerEntryOf(transaction: {
  txId: string;
  type: LedgerType;
  status: string;
  amount?: string | null;
  asset?: string | null;
  network: string;
  from?: string | null;
  to?: string | null;
  timestamp: string;
  onChainTx: string;
}): LedgerEntry {
  return {
    txId: transaction.txId,
    type: transaction.type,
    status: transaction.status,
    amount: transaction.amount,
    asset: transaction.asset,
    network: transaction.network,
    from: transaction.from,
    to: transaction.to,
    timestamp: transaction.timestamp,
    onChainTx: transaction.onChainTx,
  };
}
