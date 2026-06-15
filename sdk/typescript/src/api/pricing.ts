import type { HttpClient } from "../http.js";
import type {
  GasEstimate,
  PriceHistory,
  PriceQuote,
  SupportedChain,
  TradePair,
} from "../types/index.js";

export class PricingApi {
  constructor(
    private readonly http: HttpClient,
  ) {}

  // --- Price Data ---

  quote(params: {
    base: string;
    quote: string;
    network?: string;
  }): Promise<PriceQuote> {
    return this.http.get<PriceQuote>(
      "/pricing/quote",
      params as Record<string, unknown>,
    );
  }

  history(params: {
    base: string;
    quote: string;
    interval: string;
    from?: string;
    to?: string;
  }): Promise<PriceHistory> {
    return this.http.get<PriceHistory>(
      "/pricing/history",
      params as Record<string, unknown>,
    );
  }

  assets(): Promise<{
    assets: Array<{ symbol: string; address?: string; decimals: number }>;
  }> {
    return this.http.get<{
      assets: Array<{ symbol: string; address?: string; decimals: number }>;
    }>("/pricing/assets");
  }

  pairs(): Promise<{ pairs: Array<TradePair> }> {
    return this.http.get<{ pairs: Array<TradePair> }>("/pricing/pairs");
  }

  networks(): Promise<{ networks: Array<SupportedChain> }> {
    return this.http.get<{ networks: Array<SupportedChain> }>(
      "/pricing/networks",
    );
  }

  gas(network: string): Promise<GasEstimate> {
    return this.http.get<GasEstimate>("/pricing/gas", { network });
  }

}
