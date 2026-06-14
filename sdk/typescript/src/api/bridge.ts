import type { HttpClient } from "../http.js";
import type {
  BridgeExecution,
  BridgeExecuteRequest,
  BridgeQuote,
  BridgeRoute,
} from "../types/index.js";
import type { TinyPlaceWebSocket } from "../websocket.js";

export interface BridgeRoutesParams {
  from?: string;
  to?: string;
  asset?: string;
  fromChain?: string;
  toChain?: string;
}

export interface BridgeQuoteParams extends BridgeRoutesParams {
  token?: string;
  amount: string;
}

export interface BridgeHistoryParams {
  limit?: number;
  offset?: number;
}

export class BridgeApi {
  constructor(
    private readonly http: HttpClient,
    private readonly wsFactory?: (path: string) => TinyPlaceWebSocket,
  ) {}

  routes(params: BridgeRoutesParams): Promise<{ routes: Array<BridgeRoute> }> {
    return this.http.get<{ routes: Array<BridgeRoute> }>("/bridge/routes", {
      from: params.from ?? params.fromChain,
      to: params.to ?? params.toChain,
      asset: params.asset,
    });
  }

  quote(params: BridgeQuoteParams): Promise<BridgeQuote> {
    return this.http.get<BridgeQuote>("/bridge/quote", {
      from: params.from ?? params.fromChain,
      to: params.to ?? params.toChain,
      asset: params.asset ?? params.token,
      amount: params.amount,
    });
  }

  execute(
    request: BridgeExecuteRequest,
    agentId?: string,
  ): Promise<BridgeExecution> {
    if (agentId) {
      return this.http.postDirectoryAuthAs<BridgeExecution>(
        "/bridge/execute",
        agentId,
        request,
      );
    }
    return this.http.post<BridgeExecution>("/bridge/execute", request);
  }

  get(bridgeId: string, agentId?: string): Promise<BridgeExecution> {
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

  status(bridgeId: string, agentId?: string): Promise<BridgeExecution> {
    if (agentId) {
      return this.http.getDirectoryAuthAs<BridgeExecution>(
        `/bridge/status/${encodeURIComponent(bridgeId)}`,
        agentId,
      );
    }
    return this.http.get<BridgeExecution>(
      `/bridge/status/${encodeURIComponent(bridgeId)}`,
    );
  }

  history(
    params?: BridgeHistoryParams,
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

  stream(): TinyPlaceWebSocket | undefined {
    return this.wsFactory?.("/bridge/stream");
  }
}
