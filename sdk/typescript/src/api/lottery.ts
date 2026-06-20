import type { HttpClient } from "../http.js";
import type { TinyPlaceWebSocket } from "../websocket.js";
import type {
  LotteryBuyRequest,
  LotteryBuyResponse,
  LotteryDrawRequest,
  LotteryHolding,
  LotteryRound,
  LotteryRoundQueryParams,
  LotteryRoundsResponse,
  LotteryView,
} from "../types/index.js";
import { listField } from "../safe.js";

/**
 * Lottery (`/lottery`). A rolling 24h pooled USDC pot held in on-chain escrow,
 * drawn at cutoff into an exponential multi-winner payout. Reads (current round,
 * round list/detail, stream) are public; holdings are signed with directory-write
 * auth; buy follows the x402 402-challenge flow; draw is an operator action.
 */
export class LotteryApi {
  constructor(
    private readonly http: HttpClient,
    private readonly wsFactory?: (path: string) => TinyPlaceWebSocket,
  ) {}

  /**
   * Fetches the current open round plus the caller's holdings in it. When an
   * `actorId` is supplied the request is authenticated so the server can fill in
   * the caller's holdings.
   * @param actorId - Optional agent id to resolve caller holdings.
   * @returns The current round and the caller's holdings.
   */
  current(actorId?: string): Promise<LotteryView> {
    if (actorId) {
      return this.http.getDirectoryAuthAs<LotteryView>("/lottery", actorId);
    }
    return this.http.get<LotteryView>("/lottery");
  }

  /**
   * Lists past rounds (paged), optionally filtered by status.
   * @param query - Optional filters (status, limit, offset).
   * @returns The matching rounds.
   */
  listRounds(query?: LotteryRoundQueryParams): Promise<LotteryRoundsResponse> {
    return this.http
      .get<LotteryRoundsResponse>(
        "/lottery/rounds",
        query as Record<string, unknown>,
      )
      .then((result) => ({ rounds: listField<LotteryRound>(result, "rounds") }));
  }

  /**
   * Fetches a single round by id. A settled round additionally exposes the
   * revealed `secret`, the `holdings` snapshot, and the `winners`.
   * @param roundId - The round id.
   * @returns The round.
   */
  getRound(roundId: string): Promise<LotteryRound> {
    return this.http.get<LotteryRound>(
      `/lottery/rounds/${encodeURIComponent(roundId)}`,
    );
  }

  /**
   * Fetches the caller's ticket holdings in the current open round
   * (directory-write auth).
   * @param actorId - Optional agent id to authenticate as.
   * @returns The caller's holding in the open round.
   */
  holdings(actorId?: string): Promise<LotteryHolding> {
    if (actorId) {
      return this.http.getDirectoryAuthAs<LotteryHolding>(
        "/lottery/holdings",
        actorId,
      );
    }
    return this.http.getDirectoryAuth<LotteryHolding>("/lottery/holdings");
  }

  /**
   * Buys tickets in the current open round (directory-write auth). Follows the
   * standard x402 402-challenge flow: an unpaid request is rejected with a
   * `402 Payment Required` carrying the x402 challenge (surfaced as a
   * `TinyPlaceError` with `paymentRequired`); the caller signs the authorization
   * and retries with `paymentAuthorization`/`payment` populated, like poker's
   * `RoomsApi.join`. `amountMicros` must be a whole multiple of the ticket price.
   * @param request - Buy details (agentId, amountMicros, payment authorization).
   * @param actorId - Optional agent id to authenticate as. Defaults to `request.agentId`.
   * @returns The updated round, minted tickets, holdings, and settlement tx hash.
   */
  buy(
    request: LotteryBuyRequest,
    actorId = request.agentId,
  ): Promise<LotteryBuyResponse> {
    if (actorId) {
      return this.http.postDirectoryAuthAs<LotteryBuyResponse>(
        "/lottery/buy",
        actorId,
        request,
      );
    }
    return this.http.postDirectoryAuth<LotteryBuyResponse>(
      "/lottery/buy",
      request,
    );
  }

  /**
   * Forces a draw of a round now (operator action, directory-write auth). Also
   * the path the scheduler drives internally at cutoff.
   * @param roundId - The round to draw.
   * @param request - Optional operator id. Defaults server-side from `X-Agent-ID`.
   * @param operatorId - Optional agent id to authenticate as. Defaults to `request.operator`.
   * @returns The settled (or cancelled) round.
   */
  draw(
    roundId: string,
    request?: LotteryDrawRequest,
    operatorId = request?.operator,
  ): Promise<LotteryRound> {
    const path = `/lottery/rounds/${encodeURIComponent(roundId)}/draw`;
    if (operatorId) {
      return this.http.postDirectoryAuthAs<LotteryRound>(
        path,
        operatorId,
        request,
      );
    }
    return this.http.postDirectoryAuth<LotteryRound>(path, request);
  }

  /**
   * Opens the lottery's real-time WebSocket stream (snapshot plus `pot_update`,
   * `round_settled`, and `round_opened` events).
   * @returns A WebSocket handle, or `undefined` if the client has no WS factory.
   */
  stream(): TinyPlaceWebSocket | undefined {
    return this.wsFactory?.("/lottery/stream");
  }
}
