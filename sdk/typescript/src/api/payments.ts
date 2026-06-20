import type { SigningKey } from "../auth.js";
import type { HttpClient } from "../http.js";
import {
  executeSolanaX402Payment,
  type SolanaX402PaymentExecution,
  type SolanaX402PaymentExecutionOptions,
} from "../solana.js";
import type {
  DueRenewalResult,
  PaymentBatchFlushRequest,
  PaymentBatchFlushResponse,
  Subscription,
  SubscriptionCreateRequest,
  SubscriptionRenewRequest,
  SubscriptionRenewResponse,
  SupportedChain,
  X402SettleRequest,
  X402SettleResponse,
  X402VerifyRequest,
  X402VerifyResponse,
  X402VerifyUntilValidOptions,
} from "../types/index.js";
import { listField } from "../safe.js";

const DEFAULT_VERIFY_ATTEMPTS = 10;
const DEFAULT_VERIFY_INTERVAL_MS = 2000;
const DEFAULT_RETRY_ERRORS = [
  "transaction not found",
  "insufficient confirmations",
];

export interface SolanaSettlementOptions
  extends Omit<SolanaX402PaymentExecutionOptions, "payment" | "signer"> {
  scheme?: "exact" | "upto" | "batch-settlement";
  network: string;
  asset: string;
  amount: string;
  from?: string;
  to: string;
  nonce?: string;
  expiresAt?: string;
  expiresInMs?: number;
  metadata?: Record<string, string>;
  settledAmount?: string;
  feeQuoteId?: string;
  reference?: Record<string, unknown>;
  shielded?: boolean;
}

export interface SolanaSettlementResult {
  execution: SolanaX402PaymentExecution;
  settlement: X402SettleResponse;
}

export type SolanaSettlementRecoveryState =
  "settlement_failed_after_execution";

export interface SolanaSettlementRecovery {
  state: SolanaSettlementRecoveryState;
  action: "retry_settlement_or_refund";
  onChainTx: string;
  payment: X402VerifyRequest;
  settlementRequest: X402SettleRequest;
  retryable: true;
  refundRequired: true;
}

export interface SolanaSettlementFailure extends Error {
  execution?: SolanaX402PaymentExecution;
  settlementRecovery?: SolanaSettlementRecovery;
  onChainTx?: string;
  payment?: X402VerifyRequest;
}

function sleep(intervalMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, intervalMs);
  });
}

function shouldRetryVerify(
  response: X402VerifyResponse,
  retryErrors: Array<string>,
): boolean {
  if (response.valid || response.error === undefined) {
    return false;
  }

  const error = response.error.toLowerCase();
  return retryErrors.some((retryError) =>
    error.includes(retryError.toLowerCase()),
  );
}

export class PaymentsApi {
  constructor(
    private readonly http: HttpClient,
    private readonly signingKey?: SigningKey,
  ) {}

  verify(request: X402VerifyRequest): Promise<X402VerifyResponse> {
    return this.http.post<X402VerifyResponse>("/payments/verify", {
      payment: request,
    });
  }

  async verifyUntilValid(
    request: X402VerifyRequest,
    options: X402VerifyUntilValidOptions = {},
  ): Promise<X402VerifyResponse> {
    const attempts = options.attempts ?? DEFAULT_VERIFY_ATTEMPTS;
    const intervalMs = options.intervalMs ?? DEFAULT_VERIFY_INTERVAL_MS;
    const retryErrors = options.retryErrors ?? DEFAULT_RETRY_ERRORS;
    let response: X402VerifyResponse = await this.verify(request);

    for (let attempt = 1; attempt < attempts; attempt += 1) {
      if (!shouldRetryVerify(response, retryErrors)) {
        return response;
      }

      if (intervalMs > 0) {
        await sleep(intervalMs);
      }

      response = await this.verify(request);
    }

    return response;
  }

  settle(request: X402SettleRequest): Promise<X402SettleResponse> {
    const { payment, settledAmount, feeQuoteId, reference, shielded, delegatedTx } =
      request;
    return this.http.post<X402SettleResponse>("/payments/settle", {
      payment,
      settledAmount,
      feeQuoteId,
      reference,
      shielded,
      delegatedTx,
    });
  }

  /**
   * Fetch the facilitator's base58 account, which the client must set as the
   * fee payer when building a delegated transfer.
   */
  facilitator(): Promise<{ address: string; network: string }> {
    return this.http.get<{ address: string; network: string }>(
      "/payments/facilitator",
    );
  }

  async settleWithSolanaPayment(
    options: SolanaSettlementOptions,
  ): Promise<SolanaSettlementResult> {
    if (!this.signingKey) {
      throw new Error("settleWithSolanaPayment requires a signing key");
    }

    const {
      scheme,
      network,
      asset,
      amount,
      from,
      to,
      nonce,
      expiresAt,
      expiresInMs,
      metadata,
      settledAmount,
      feeQuoteId,
      reference,
      shielded,
      mint,
      ...executionOptions
    } = options;
    const execution = await executeSolanaX402Payment({
      ...executionOptions,
      // Pass the mint through as-is. The executor defaults to USDC for SPL
      // transfers and ignores the mint entirely for native-SOL payments, so we
      // must NOT force a USDC mint here (that would break native SOL).
      mint,
      signer: this.signingKey,
      payment: {
        scheme: scheme ?? "exact",
        network,
        asset,
        amount,
        from,
        to,
        nonce,
        expiresAt,
        expiresInMs,
        metadata,
      },
    });
    const payment = paymentMapToVerifyRequest(execution.payment);
    const settlementRequest: X402SettleRequest = {
      payment,
      settledAmount,
      feeQuoteId,
      reference,
      shielded,
    };

    let settlement: X402SettleResponse;
    try {
      settlement = await this.settle(settlementRequest);
    } catch (error) {
      throw attachSolanaSettlementRecovery(error, execution, settlementRequest);
    }

    return { execution, settlement };
  }

  supported(): Promise<{ chains: Array<SupportedChain> }> {
    return this.http
      .get<{ chains: Array<SupportedChain> }>("/payments/supported")
      .then((result) => ({
        chains: listField<SupportedChain>(result, "chains"),
      }));
  }

  createSubscription(subscription: SubscriptionCreateRequest): Promise<Subscription> {
    return this.http.post<Subscription>(
      "/payments/subscriptions",
      subscription,
    );
  }

  getSubscription(
    subscriptionId: string,
    actor?: string,
  ): Promise<Subscription> {
    const path = `/payments/subscriptions/${encodeURIComponent(subscriptionId)}`;
    if (actor) {
      return this.http.getDirectoryAuthAs<Subscription>(path, actor);
    }
    return this.http.getAgentAuth<Subscription>(path);
  }

  cancelSubscription(subscriptionId: string, actor?: string): Promise<void> {
    const path = `/payments/subscriptions/${encodeURIComponent(subscriptionId)}`;
    if (actor) {
      return this.http.deleteDirectoryAuthAs<void>(path, actor);
    }
    return this.http.deleteAgentAuth<void>(path);
  }

  renewSubscription(
    subscriptionId: string,
    request: SubscriptionRenewRequest,
  ): Promise<SubscriptionRenewResponse> {
    return this.http.post<SubscriptionRenewResponse>(
      `/payments/subscriptions/${encodeURIComponent(subscriptionId)}/renew`,
      request,
    );
  }

  renewDueSubscriptions(params?: {
    limit?: number;
  }): Promise<DueRenewalResult> {
    return this.http.postAdmin<DueRenewalResult>(
      "/payments/subscriptions/renew-due",
      params,
    );
  }

  flushBatch(
    batchId: string,
    request: PaymentBatchFlushRequest,
  ): Promise<PaymentBatchFlushResponse> {
    return this.http.postAdmin<PaymentBatchFlushResponse>(
      `/payments/batches/${encodeURIComponent(batchId)}/flush`,
      request,
    );
  }
}

function attachSolanaSettlementRecovery(
  error: unknown,
  execution: SolanaX402PaymentExecution,
  settlementRequest: X402SettleRequest,
): unknown {
  if (typeof error === "object" && error !== null) {
    const failure = error as SolanaSettlementFailure;
    failure.execution = execution;
    failure.onChainTx = execution.signature;
    failure.payment = settlementRequest.payment;
    failure.settlementRecovery = {
      state: "settlement_failed_after_execution",
      action: "retry_settlement_or_refund",
      onChainTx: execution.signature,
      payment: settlementRequest.payment,
      settlementRequest,
      retryable: true,
      refundRequired: true,
    };
  }
  return error;
}

function paymentMapToVerifyRequest(
  payment: Record<string, string>,
): X402VerifyRequest {
  const metadata: Record<string, string> = {};
  for (const [key, value] of Object.entries(payment)) {
    if (key.startsWith("metadata.")) {
      metadata[key.slice("metadata.".length)] = value;
    }
  }
  return {
    scheme: payment["scheme"] as X402VerifyRequest["scheme"],
    network: payment["network"] ?? "",
    asset: payment["asset"] ?? "",
    amount: payment["amount"] ?? "",
    from: payment["from"] ?? "",
    to: payment["to"] ?? "",
    nonce: payment["nonce"] ?? "",
    expiresAt: payment["expiresAt"] ?? "",
    signature: payment["signature"] ?? "",
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  };
}
