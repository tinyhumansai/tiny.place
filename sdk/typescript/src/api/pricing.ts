import type { HttpClient } from "../http.js";
import type { TinyVerseWebSocket } from "../websocket.js";
import type {
  BridgeExecution,
  BridgeExecuteRequest,
  BridgeQuote,
  BridgeRoute,
  GasEstimate,
  PriceHistory,
  PriceQuote,
  SwapExecution,
  SwapExecuteRequest,
  SwapQuote,
  TradePair,
} from "../types/index.js";

export class PricingApi {
  constructor(
    private readonly http: HttpClient,
    private readonly wsFactory?: (path: string) => TinyVerseWebSocket,
  ) {}

  // --- Price Data ---

  quote(params: { base: string; quote: string; network?: string }): Promise<PriceQuote> {
    return this.http.get<PriceQuote>("/pricing/quote", params as Record<string, unknown>);
  }

  history(params: {
    base: string;
    quote: string;
    interval: string;
    from?: string;
    to?: string;
  }): Promise<PriceHistory> {
    return this.http.get<PriceHistory>("/pricing/history", params as Record<string, unknown>);
  }

  assets(): Promise<{ assets: Array<{ symbol: string; address?: string; decimals: number }> }> {
    return this.http.get<{ assets: Array<{ symbol: string; address?: string; decimals: number }> }>(
      "/pricing/assets",
    );
  }

  pairs(): Promise<{ pairs: Array<TradePair> }> {
    return this.http.get<{ pairs: Array<TradePair> }>("/pricing/pairs");
  }

  networks(): Promise<{ networks: Array<string> }> {
    return this.http.get<{ networks: Array<string> }>("/pricing/networks");
  }

  gas(network: string): Promise<GasEstimate> {
    return this.http.get<GasEstimate>("/pricing/gas", { network });
  }

  priceStream(): TinyVerseWebSocket | undefined {
    return this.wsFactory?.("/pricing/stream");
  }

  // --- Swap ---

  swapQuote(params: {
    fromAsset: string;
    toAsset: string;
    amount: string;
  }): Promise<SwapQuote> {
    return this.http.get<SwapQuote>("/swap/quote", params as Record<string, unknown>);
  }

  executeSwap(request: SwapExecuteRequest): Promise<SwapExecution> {
    return this.http.post<SwapExecution>("/swap/execute", request);
  }

  getSwap(swapId: string): Promise<SwapExecution> {
    return this.http.getAuth<SwapExecution>(`/swap/${encodeURIComponent(swapId)}`);
  }

  swapHistory(params?: { limit?: number; offset?: number }): Promise<{ swaps: Array<SwapExecution> }> {
    return this.http.getAuth<{ swaps: Array<SwapExecution> }>(
      "/swap/history",
      params as Record<string, unknown>,
    );
  }

  // --- Bridge ---

  bridgeRoutes(params: { fromChain: string; toChain: string }): Promise<{ routes: Array<BridgeRoute> }> {
    return this.http.get<{ routes: Array<BridgeRoute> }>(
      "/bridge/routes",
      params as Record<string, unknown>,
    );
  }

  bridgeQuote(params: {
    fromChain: string;
    toChain: string;
    token: string;
    amount: string;
  }): Promise<BridgeQuote> {
    return this.http.get<BridgeQuote>("/bridge/quote", params as Record<string, unknown>);
  }

  executeBridge(request: BridgeExecuteRequest): Promise<BridgeExecution> {
    return this.http.post<BridgeExecution>("/bridge/execute", request);
  }

  getBridge(bridgeId: string): Promise<BridgeExecution> {
    return this.http.getAuth<BridgeExecution>(`/bridge/${encodeURIComponent(bridgeId)}`);
  }

  bridgeHistory(params?: { limit?: number; offset?: number }): Promise<{ bridges: Array<BridgeExecution> }> {
    return this.http.getAuth<{ bridges: Array<BridgeExecution> }>(
      "/bridge/history",
      params as Record<string, unknown>,
    );
  }

  bridgeStream(): TinyVerseWebSocket | undefined {
    return this.wsFactory?.("/bridge/stream");
  }
}
