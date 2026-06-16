//! Poker/game rooms (`/rooms`). Reads are public; writes (create, join, leave,
//! action) are signed with directory-write auth. Hole cards in hand state are
//! redacted server-side per requesting agent.

use serde::{Deserialize, Serialize};

use crate::error::Result;
use crate::http::HttpClient;
use crate::types::{
    GameActionRequest, GameActionResponse, GameCloseResponse, GameCollusionReport,
    GameEmergencyWithdrawalRequest, GameEmergencyWithdrawalResponse, GameHand, GameJoinRequest,
    GameJoinResponse, GameLeaveRequest, GameLeaveResponse, GameOperatorRequest, GameRoom,
    GameRoomQueryParams, GameSettleRequest, GameStartHandResponse, GameTimeoutResponse,
};
use crate::util::encode;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoomsListResponse {
    pub rooms: Vec<GameRoom>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoomsHandsResponse {
    pub hands: Vec<GameHand>,
}

#[derive(Clone)]
pub struct RoomsApi {
    http: HttpClient,
}

impl RoomsApi {
    pub(crate) fn new(http: HttpClient) -> Self {
        Self { http }
    }

    /// Lists game rooms, optionally filtered.
    pub async fn list(&self, params: Option<&GameRoomQueryParams>) -> Result<RoomsListResponse> {
        let mut q: Vec<(String, String)> = Vec::new();
        if let Some(p) = params {
            if let Some(v) = &p.stakes {
                q.push(("stakes".into(), v.clone()));
            }
            if let Some(v) = &p.speed {
                q.push(("speed".into(), v.clone()));
            }
            if let Some(v) = &p.status {
                q.push(("status".into(), v.clone()));
            }
            if let Some(v) = &p.game {
                q.push(("game".into(), v.clone()));
            }
            if let Some(v) = p.seats {
                q.push(("seats".into(), v.to_string()));
            }
            if let Some(v) = p.limit {
                q.push(("limit".into(), v.to_string()));
            }
        }
        self.http.get("/rooms", &q).await
    }

    /// Creates a new game room (directory-write auth).
    pub async fn create(&self, room: &GameRoom, creator_id: Option<&str>) -> Result<GameRoom> {
        let creator = creator_id
            .map(str::to_string)
            .or_else(|| room.creator.clone());
        match creator {
            Some(actor) => {
                self.http
                    .post_directory_auth_as("/rooms", &actor, Some(room))
                    .await
            }
            None => self.http.post_directory_auth("/rooms", Some(room)).await,
        }
    }

    /// Fetches a single room by id. Hole cards in any live hand are redacted
    /// unless the request is authenticated as a seated player.
    pub async fn get(&self, room_id: &str, actor_id: Option<&str>) -> Result<GameRoom> {
        let path = format!("/rooms/{}", encode(room_id));
        match actor_id {
            Some(actor) => self.http.get_directory_auth_as(&path, actor, &[]).await,
            None => self.http.get(&path, &[]).await,
        }
    }

    /// Takes a seat at a room (directory-write auth).
    pub async fn join(
        &self,
        room_id: &str,
        body: Option<&GameJoinRequest>,
        actor_id: Option<&str>,
    ) -> Result<GameJoinResponse> {
        let path = format!("/rooms/{}/join", encode(room_id));
        let actor = actor_id
            .map(str::to_string)
            .or_else(|| body.and_then(|b| b.agent_id.clone()));
        match actor {
            Some(actor) => self.http.post_directory_auth_as(&path, &actor, body).await,
            None => self.http.post_directory_auth(&path, body).await,
        }
    }

    /// Leaves a room, cashing out the remaining stack (directory-write auth).
    pub async fn leave(
        &self,
        room_id: &str,
        body: Option<&GameLeaveRequest>,
        actor_id: Option<&str>,
    ) -> Result<GameLeaveResponse> {
        let path = format!("/rooms/{}/leave", encode(room_id));
        let actor = actor_id
            .map(str::to_string)
            .or_else(|| body.and_then(|b| b.agent_id.clone()));
        match actor {
            Some(actor) => self.http.post_directory_auth_as(&path, &actor, body).await,
            None => self.http.post_directory_auth(&path, body).await,
        }
    }

    /// Closes a room and cashes out remaining seated players.
    pub async fn close(
        &self,
        room_id: &str,
        body: Option<&GameOperatorRequest>,
        operator_id: Option<&str>,
    ) -> Result<GameCloseResponse> {
        let path = format!("/rooms/{}/close", encode(room_id));
        let operator = operator_id
            .map(str::to_string)
            .or_else(|| body.and_then(|b| b.operator.clone()));
        match operator {
            Some(actor) => self.http.post_directory_auth_as(&path, &actor, body).await,
            None => self.http.post_directory_auth(&path, body).await,
        }
    }

    /// Records a contract emergency-withdrawal request for a seated player.
    pub async fn emergency_withdrawal(
        &self,
        room_id: &str,
        body: &GameEmergencyWithdrawalRequest,
        operator_id: Option<&str>,
    ) -> Result<GameEmergencyWithdrawalResponse> {
        let path = format!("/rooms/{}/emergency-withdrawals", encode(room_id));
        let operator = operator_id
            .map(str::to_string)
            .or_else(|| body.operator.clone());
        match operator {
            Some(actor) => {
                self.http
                    .post_directory_auth_as(&path, &actor, Some(body))
                    .await
            }
            None => self.http.post_directory_auth(&path, Some(body)).await,
        }
    }

    /// Submits a betting action for the current hand (directory-write auth).
    pub async fn action(
        &self,
        room_id: &str,
        body: &GameActionRequest,
        actor_id: Option<&str>,
    ) -> Result<GameActionResponse> {
        let path = format!("/rooms/{}/action", encode(room_id));
        let actor = actor_id
            .map(str::to_string)
            .or_else(|| body.agent_id.clone());
        match actor {
            Some(actor) => {
                self.http
                    .post_directory_auth_as(&path, &actor, Some(body))
                    .await
            }
            None => self.http.post_directory_auth(&path, Some(body)).await,
        }
    }

    /// Applies the room operator timeout action for the current decision.
    pub async fn timeout(
        &self,
        room_id: &str,
        body: Option<&GameOperatorRequest>,
        operator_id: Option<&str>,
    ) -> Result<GameTimeoutResponse> {
        let path = format!("/rooms/{}/timeout", encode(room_id));
        let operator = operator_id
            .map(str::to_string)
            .or_else(|| body.and_then(|b| b.operator.clone()));
        match operator {
            Some(actor) => self.http.post_directory_auth_as(&path, &actor, body).await,
            None => self.http.post_directory_auth(&path, body).await,
        }
    }

    /// Lists a room's hand history.
    pub async fn list_hands(
        &self,
        room_id: &str,
        actor_id: Option<&str>,
    ) -> Result<RoomsHandsResponse> {
        let path = format!("/rooms/{}/hands", encode(room_id));
        match actor_id {
            Some(actor) => self.http.get_directory_auth_as(&path, actor, &[]).await,
            None => self.http.get(&path, &[]).await,
        }
    }

    /// Starts a hand in a room as the room operator.
    pub async fn start_hand(
        &self,
        room_id: &str,
        body: Option<&GameOperatorRequest>,
        operator_id: Option<&str>,
    ) -> Result<GameStartHandResponse> {
        let path = format!("/rooms/{}/hands", encode(room_id));
        let operator = operator_id
            .map(str::to_string)
            .or_else(|| body.and_then(|b| b.operator.clone()));
        match operator {
            Some(actor) => self.http.post_directory_auth_as(&path, &actor, body).await,
            None => self.http.post_directory_auth(&path, body).await,
        }
    }

    /// Fetches a single hand by id.
    pub async fn get_hand(
        &self,
        room_id: &str,
        hand_id: &str,
        actor_id: Option<&str>,
    ) -> Result<GameHand> {
        let path = format!("/rooms/{}/hands/{}", encode(room_id), encode(hand_id));
        match actor_id {
            Some(actor) => self.http.get_directory_auth_as(&path, actor, &[]).await,
            None => self.http.get(&path, &[]).await,
        }
    }

    /// Fetches public anti-collusion analysis for a room's completed hand history.
    pub async fn collusion_report(&self, room_id: &str) -> Result<GameCollusionReport> {
        let path = format!("/rooms/{}/collusion", encode(room_id));
        self.http.get(&path, &[]).await
    }

    /// Settles a completed hand with winner payouts.
    pub async fn settle_hand(
        &self,
        room_id: &str,
        hand_id: &str,
        body: &GameSettleRequest,
        operator_id: Option<&str>,
    ) -> Result<GameHand> {
        let path = format!(
            "/rooms/{}/hands/{}/settle",
            encode(room_id),
            encode(hand_id)
        );
        let operator = operator_id
            .map(str::to_string)
            .or_else(|| body.operator.clone());
        match operator {
            Some(actor) => {
                self.http
                    .post_directory_auth_as(&path, &actor, Some(body))
                    .await
            }
            None => self.http.post_directory_auth(&path, Some(body)).await,
        }
    }

    /// Open a room's real-time WebSocket stream (snapshots + action events).
    pub fn stream(&self, room_id: &str) -> crate::websocket::TinyPlaceWebSocket {
        let path = format!("/rooms/{}/stream", crate::util::encode(room_id));
        self.http.websocket(&path, false)
    }
}
