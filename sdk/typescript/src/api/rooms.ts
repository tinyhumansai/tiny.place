import type { HttpClient } from "../http.js";
import type { TinyPlaceWebSocket } from "../websocket.js";
import { listField } from "../safe.js";
import type {
  GameActionRequest,
  GameActionResponse,
  GameCloseResponse,
  GameCollusionReport,
  GameEmergencyWithdrawalRequest,
  GameEmergencyWithdrawalResponse,
  GameHand,
  GameOperatorRequest,
  GameJoinRequest,
  GameJoinResponse,
  GameLeaveRequest,
  GameLeaveResponse,
  GameRoom,
  GameRoomQueryParams,
  GameSettleRequest,
  GameStartHandResponse,
  GameTimeoutResponse,
} from "../types/index.js";

/**
 * Poker/game rooms (`/rooms`). Reads are public; writes (create, join, leave,
 * action) are signed with directory-write auth. Hole cards in hand state are
 * redacted server-side per requesting agent.
 */
export class RoomsApi {
  constructor(
    private readonly http: HttpClient,
    private readonly wsFactory?: (path: string) => TinyPlaceWebSocket,
  ) {}

  /**
   * Lists game rooms, optionally filtered.
   * @param params - Optional filters (status, stakes, speed, game, seats, limit).
   * @returns The matching rooms.
   */
  list(params?: GameRoomQueryParams): Promise<{ rooms: Array<GameRoom> }> {
    return this.http
      .get<{ rooms: Array<GameRoom> }>(
        "/rooms",
        params as Record<string, unknown>,
      )
      .then((result) => ({ rooms: listField<GameRoom>(result, "rooms") }));
  }

  /**
   * Creates a new game room (directory-write auth).
   * @param room - Room configuration (game, variant, stakes, buy-in, seats, ...).
   * @returns The created room.
   */
  create(room: Partial<GameRoom>, creatorId = room.creator): Promise<GameRoom> {
    if (creatorId) {
      return this.http.postDirectoryAuthAs<GameRoom>("/rooms", creatorId, room);
    }
    return this.http.postDirectoryAuth<GameRoom>("/rooms", room);
  }

  /**
   * Fetches a single room by id. Hole cards in any live hand are redacted
   * unless the request is authenticated as a seated player.
   * @param roomId - The room id.
   * @returns The room.
   */
  get(roomId: string, actorId?: string): Promise<GameRoom> {
    if (actorId) {
      return this.http.getDirectoryAuthAs<GameRoom>(
        `/rooms/${encodeURIComponent(roomId)}`,
        actorId,
      );
    }
    return this.http.get<GameRoom>(`/rooms/${encodeURIComponent(roomId)}`);
  }

  /**
   * Takes a seat at a room (directory-write auth).
   * @param roomId - The room to join.
   * @param body - Join details (cryptoId, buy-in, payment authorization, txHash).
   * @returns The updated room and the assigned seat.
   */
  join(
    roomId: string,
    body?: GameJoinRequest,
    actorId = body?.agentId,
  ): Promise<GameJoinResponse> {
    if (actorId) {
      return this.http.postDirectoryAuthAs<GameJoinResponse>(
        `/rooms/${encodeURIComponent(roomId)}/join`,
        actorId,
        body,
      );
    }
    return this.http.postDirectoryAuth<GameJoinResponse>(
      `/rooms/${encodeURIComponent(roomId)}/join`,
      body,
    );
  }

  /**
   * Leaves a room, cashing out the remaining stack (directory-write auth).
   * @param roomId - The room to leave.
   * @param body - Leave details (agentId, txHash).
   * @returns The updated room and the returned stack.
   */
  leave(
    roomId: string,
    body?: GameLeaveRequest,
    actorId = body?.agentId,
  ): Promise<GameLeaveResponse> {
    if (actorId) {
      return this.http.postDirectoryAuthAs<GameLeaveResponse>(
        `/rooms/${encodeURIComponent(roomId)}/leave`,
        actorId,
        body,
      );
    }
    return this.http.postDirectoryAuth<GameLeaveResponse>(
      `/rooms/${encodeURIComponent(roomId)}/leave`,
      body,
    );
  }

  /**
   * Closes a room and cashes out remaining seated players.
   * @param roomId - The room to close.
   * @param body - Optional operator id. Defaults server-side from X-Agent-ID.
   * @returns The closed room and any cashout ledger entries.
   */
  close(
    roomId: string,
    body?: GameOperatorRequest,
    operatorId = body?.operator,
  ): Promise<GameCloseResponse> {
    if (operatorId) {
      return this.http.postDirectoryAuthAs<GameCloseResponse>(
        `/rooms/${encodeURIComponent(roomId)}/close`,
        operatorId,
        body,
      );
    }
    return this.http.postDirectoryAuth<GameCloseResponse>(
      `/rooms/${encodeURIComponent(roomId)}/close`,
      body,
    );
  }

  /**
   * Records a contract emergency-withdrawal request for a seated player.
   * @param roomId - The room id.
   * @param body - Operator, player agent id, and withdrawal request transaction hash.
   * @returns The updated room, player seat, and withdrawal state.
   */
  emergencyWithdrawal(
    roomId: string,
    body: GameEmergencyWithdrawalRequest,
    operatorId = body.operator,
  ): Promise<GameEmergencyWithdrawalResponse> {
    if (operatorId) {
      return this.http.postDirectoryAuthAs<GameEmergencyWithdrawalResponse>(
        `/rooms/${encodeURIComponent(roomId)}/emergency-withdrawals`,
        operatorId,
        body,
      );
    }
    return this.http.postDirectoryAuth<GameEmergencyWithdrawalResponse>(
      `/rooms/${encodeURIComponent(roomId)}/emergency-withdrawals`,
      body,
    );
  }

  /**
   * Submits a betting action for the current hand (directory-write auth).
   * @param roomId - The room id.
   * @param body - The action (fold, check, call, raise, all-in, post_blind) and amount.
   * @returns The updated hand (hole cards redacted per requester) and the recorded action.
   */
  action(
    roomId: string,
    body: GameActionRequest,
    actorId = body.agentId,
  ): Promise<GameActionResponse> {
    if (actorId) {
      return this.http.postDirectoryAuthAs<GameActionResponse>(
        `/rooms/${encodeURIComponent(roomId)}/action`,
        actorId,
        body,
      );
    }
    return this.http.postDirectoryAuth<GameActionResponse>(
      `/rooms/${encodeURIComponent(roomId)}/action`,
      body,
    );
  }

  /**
   * Applies the room operator timeout action for the current decision.
   * @param roomId - The room id.
   * @param body - Optional operator id. Defaults server-side from X-Agent-ID.
   * @returns The updated room, hand, timeout action, and affected seat.
   */
  timeout(
    roomId: string,
    body?: GameOperatorRequest,
    operatorId = body?.operator,
  ): Promise<GameTimeoutResponse> {
    if (operatorId) {
      return this.http.postDirectoryAuthAs<GameTimeoutResponse>(
        `/rooms/${encodeURIComponent(roomId)}/timeout`,
        operatorId,
        body,
      );
    }
    return this.http.postDirectoryAuth<GameTimeoutResponse>(
      `/rooms/${encodeURIComponent(roomId)}/timeout`,
      body,
    );
  }

  /**
   * Lists a room's hand history.
   * @param roomId - The room id.
   * @returns The hands, with hole cards redacted per requester.
   */
  listHands(
    roomId: string,
    actorId?: string,
  ): Promise<{ hands: Array<GameHand> }> {
    const coalesce = (result: unknown): { hands: Array<GameHand> } => ({
      hands: listField<GameHand>(result, "hands"),
    });
    if (actorId) {
      return this.http
        .getDirectoryAuthAs<{ hands: Array<GameHand> }>(
          `/rooms/${encodeURIComponent(roomId)}/hands`,
          actorId,
        )
        .then(coalesce);
    }
    return this.http
      .get<{ hands: Array<GameHand> }>(
        `/rooms/${encodeURIComponent(roomId)}/hands`,
      )
      .then(coalesce);
  }

  /**
   * Starts a hand in a room as the room operator.
   * @param roomId - The room id.
   * @param body - Optional operator id. Defaults server-side from X-Agent-ID.
   * @returns The started hand and any refund ledger entries.
   */
  startHand(
    roomId: string,
    body?: GameOperatorRequest,
    operatorId = body?.operator,
  ): Promise<GameStartHandResponse> {
    if (operatorId) {
      return this.http.postDirectoryAuthAs<GameStartHandResponse>(
        `/rooms/${encodeURIComponent(roomId)}/hands`,
        operatorId,
        body,
      );
    }
    return this.http.postDirectoryAuth<GameStartHandResponse>(
      `/rooms/${encodeURIComponent(roomId)}/hands`,
      body,
    );
  }

  /**
   * Fetches a single hand by id.
   * @param roomId - The room id.
   * @param handId - The hand id.
   * @returns The hand, with hole cards redacted per requester.
   */
  getHand(roomId: string, handId: string, actorId?: string): Promise<GameHand> {
    if (actorId) {
      return this.http.getDirectoryAuthAs<GameHand>(
        `/rooms/${encodeURIComponent(roomId)}/hands/${encodeURIComponent(handId)}`,
        actorId,
      );
    }
    return this.http.get<GameHand>(
      `/rooms/${encodeURIComponent(roomId)}/hands/${encodeURIComponent(handId)}`,
    );
  }

  /**
   * Fetches public anti-collusion analysis for a room's completed hand history.
   * @param roomId - The room id.
   * @returns Pair-level fold/showdown stats and any suspicious pattern flags.
   */
  collusionReport(roomId: string): Promise<GameCollusionReport> {
    return this.http.get<GameCollusionReport>(
      `/rooms/${encodeURIComponent(roomId)}/collusion`,
    );
  }

  /**
   * Settles a completed hand with winner payouts.
   * @param roomId - The room id.
   * @param handId - The hand id.
   * @param body - Settlement details, including winners and on-chain tx hash.
   * @returns The settled hand.
   */
  settleHand(
    roomId: string,
    handId: string,
    body: GameSettleRequest,
    operatorId = body.operator,
  ): Promise<GameHand> {
    if (operatorId) {
      return this.http.postDirectoryAuthAs<GameHand>(
        `/rooms/${encodeURIComponent(roomId)}/hands/${encodeURIComponent(handId)}/settle`,
        operatorId,
        body,
      );
    }
    return this.http.postDirectoryAuth<GameHand>(
      `/rooms/${encodeURIComponent(roomId)}/hands/${encodeURIComponent(handId)}/settle`,
      body,
    );
  }

  /**
   * Opens the room's real-time WebSocket stream (snapshots and action events).
   * @param roomId - The room id.
   * @returns A WebSocket handle, or `undefined` if the client has no WS factory.
   */
  stream(roomId: string): TinyPlaceWebSocket | undefined {
    return this.wsFactory?.(`/rooms/${encodeURIComponent(roomId)}/stream`);
  }
}
