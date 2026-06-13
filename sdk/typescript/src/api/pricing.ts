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
  SupportedChain,
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

  priceStream(): TinyVerseWebSocket | undefined {
    return this.wsFactory?.("/pricing/stream");
  }

  // --- Swap ---

  swapQuote(params: {
    from?: string;
    to?: string;
    fromAsset?: string;
    toAsset?: string;
    amount: string;
    network?: string;
  }): Promise<SwapQuote> {
    return this.http.get<SwapQuote>("/swap/quote", {
      from: params.from ?? params.fromAsset,
      to: params.to ?? params.toAsset,
      amount: params.amount,
      network: params.network,
    });
  }

  executeSwap(request: SwapExecuteRequest): Promise<SwapExecution> {
    return this.http.post<SwapExecution>("/swap/execute", request);
  }

  getSwap(swapId: string, agentId?: string): Promise<SwapExecution> {
    if (agentId) {
      return this.http.getDirectoryAuthAs<SwapExecution>(
        `/swap/${encodeURIComponent(swapId)}`,
        agentId,
      );
    }
    return this.http.get<SwapExecution>(`/swap/${encodeURIComponent(swapId)}`);
  }

  getSwapStatus(swapId: string): Promise<SwapExecution> {
    return this.http.get<SwapExecution>(
      `/swap/status/${encodeURIComponent(swapId)}`,
    );
  }

  swapHistory(
    params?: {
      limit?: number;
      offset?: number;
    },
    agentId?: string,
  ): Promise<{ swaps: Array<SwapExecution> }> {
    if (agentId) {
      return this.http.getDirectoryAuthAs<{ swaps: Array<SwapExecution> }>(
        "/swap/history",
        agentId,
        params as Record<string, unknown>,
      );
    }
    return this.http.get<{ swaps: Array<SwapExecution> }>(
      "/swap/history",
      params as Record<string, unknown>,
    );
  }

  // --- Bridge ---

  bridgeRoutes(params: {
    from?: string;
    to?: string;
    asset?: string;
    fromChain?: string;
    toChain?: string;
  }): Promise<{ routes: Array<BridgeRoute> }> {
    return this.http.get<{ routes: Array<BridgeRoute> }>("/bridge/routes", {
      from: params.from ?? params.fromChain,
      to: params.to ?? params.toChain,
      asset: params.asset,
    });
  }

  bridgeQuote(params: {
    from?: string;
    to?: string;
    asset?: string;
    fromChain?: string;
    toChain?: string;
    token?: string;
    amount: string;
  }): Promise<BridgeQuote> {
    return this.http.get<BridgeQuote>("/bridge/quote", {
      from: params.from ?? params.fromChain,
      to: params.to ?? params.toChain,
      asset: params.asset ?? params.token,
      amount: params.amount,
    });
  }

  executeBridge(request: BridgeExecuteRequest): Promise<BridgeExecution> {
    return this.http.post<BridgeExecution>("/bridge/execute", request);
  }

  getBridge(bridgeId: string, agentId?: string): Promise<BridgeExecution> {
    if (agentId) {
      return this.http.getDirectoryAuthAs<BridgeExecution>(
        `/bridge/${encodeURIComponent(bridgeId)}`,
        agentId,
      );
    }
    return this.http.get<BridgeExecution>(
      `/bridge/${encodeURIComponent(bridgeId)}`,
    );
  }

  getBridgeStatus(bridgeId: string): Promise<BridgeExecution> {
    return this.http.get<BridgeExecution>(
      `/bridge/status/${encodeURIComponent(bridgeId)}`,
    );
  }

  bridgeHistory(
    params?: {
      limit?: number;
      offset?: number;
    },
    agentId?: string,
  ): Promise<{ bridges: Array<BridgeExecution> }> {
    if (agentId) {
      return this.http.getDirectoryAuthAs<{ bridges: Array<BridgeExecution> }>(
        "/bridge/history",
        agentId,
        params as Record<string, unknown>,
      );
    }
    return this.http.get<{ bridges: Array<BridgeExecution> }>(
      "/bridge/history",
      params as Record<string, unknown>,
    );
  }

  bridgeStream(): TinyVerseWebSocket | undefined {
    return this.wsFactory?.("/bridge/stream");
  }
}
