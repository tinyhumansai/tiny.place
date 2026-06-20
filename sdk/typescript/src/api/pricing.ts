import type { HttpClient } from "../http.js";
import type {
  GasEstimate,
  PriceCandle,
  PriceHistory,
  PriceQuote,
  SupportedChain,
  TradePair,
} from "../types/index.js";
import { asString, listField } from "../safe.js";

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
    return this.http
      .get<PriceHistory>(
        "/pricing/history",
        params as Record<string, unknown>,
      )
      .then((result) => ({
        base: asString((result as PriceHistory | undefined)?.base),
        quote: asString((result as PriceHistory | undefined)?.quote),
        interval: asString((result as PriceHistory | undefined)?.interval),
        candles: listField<PriceCandle>(result, "candles"),
      }));
  }

  assets(): Promise<{
    assets: Array<{ symbol: string; address?: string; decimals: number }>;
  }> {
    return this.http
      .get<{
        assets: Array<{ symbol: string; address?: string; decimals: number }>;
      }>("/pricing/assets")
      .then((result) => ({
        assets: listField<{
          symbol: string;
          address?: string;
          decimals: number;
        }>(result, "assets"),
      }));
  }

  pairs(): Promise<{ pairs: Array<TradePair> }> {
    return this.http
      .get<{ pairs: Array<TradePair> }>("/pricing/pairs")
      .then((result) => ({ pairs: listField<TradePair>(result, "pairs") }));
  }

  networks(): Promise<{ networks: Array<SupportedChain> }> {
    return this.http
      .get<{ networks: Array<SupportedChain> }>("/pricing/networks")
      .then((result) => ({
        networks: listField<SupportedChain>(result, "networks"),
      }));
  }

  gas(network: string): Promise<GasEstimate> {
    return this.http.get<GasEstimate>("/pricing/gas", { network });
  }

}
