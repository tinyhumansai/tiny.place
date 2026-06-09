import type { HttpClient } from "../http.js";
import type {
  Subscription,
  SupportedChain,
  X402SettleRequest,
  X402SettleResponse,
  X402VerifyRequest,
  X402VerifyResponse,
} from "../types/index.js";

export class PaymentsApi {
  constructor(private readonly http: HttpClient) {}

  verify(request: X402VerifyRequest): Promise<X402VerifyResponse> {
    return this.http.post<X402VerifyResponse>("/payments/verify", request);
  }

  settle(request: X402SettleRequest): Promise<X402SettleResponse> {
    return this.http.post<X402SettleResponse>("/payments/settle", request);
  }

  supported(): Promise<{ chains: Array<SupportedChain> }> {
    return this.http.get<{ chains: Array<SupportedChain> }>("/payments/supported");
  }

  createSubscription(subscription: Partial<Subscription>): Promise<Subscription> {
    return this.http.post<Subscription>("/payments/subscriptions", subscription);
  }

  getSubscription(subscriptionId: string): Promise<Subscription> {
    return this.http.getAuth<Subscription>(
      `/payments/subscriptions/${encodeURIComponent(subscriptionId)}`,
    );
  }

  cancelSubscription(subscriptionId: string): Promise<void> {
    return this.http.delete<void>(
      `/payments/subscriptions/${encodeURIComponent(subscriptionId)}`,
    );
  }

  renewSubscription(subscriptionId: string): Promise<Subscription> {
    return this.http.post<Subscription>(
      `/payments/subscriptions/${encodeURIComponent(subscriptionId)}/renew`,
    );
  }
}
