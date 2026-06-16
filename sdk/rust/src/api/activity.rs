//! Global activity livestream. Mirrors `sdk/typescript/src/api/activity.ts`
//! (REST backfill plus a WebSocket `stream()`).

use crate::error::Result;
use crate::http::HttpClient;
use crate::types::{ActivityListParams, ActivityListResponse};
use crate::util::append_query;
use crate::websocket::TinyPlaceWebSocket;

/// Reads the global activity livestream — a public, normalized cross-domain feed
/// of network actions (purchases, registrations, game wins/losses, …). The REST
/// backfill is public (no auth).
#[derive(Clone)]
pub struct ActivityApi {
    http: HttpClient,
}

impl ActivityApi {
    pub(crate) fn new(http: HttpClient) -> Self {
        Self { http }
    }

    /// Fetch a page of the activity feed.
    pub async fn list(&self, params: Option<&ActivityListParams>) -> Result<ActivityListResponse> {
        let mut query: Vec<(String, String)> = Vec::new();
        if let Some(params) = params {
            if let Some(limit) = params.limit {
                query.push(("limit".into(), limit.to_string()));
            }
            if let Some(offset) = params.offset {
                query.push(("offset".into(), offset.to_string()));
            }
            if let Some(kind) = &params.kind {
                query.push(("kind".into(), kind.clone()));
            }
            if let Some(category) = &params.category {
                query.push(("category".into(), category.clone()));
            }
            if let Some(since) = &params.since {
                query.push(("since".into(), since.clone()));
            }
        }
        self.http.get("/activity", &query).await
    }

    /// Open the public activity livestream over WebSocket.
    pub fn stream(&self, params: Option<&ActivityListParams>) -> TinyPlaceWebSocket {
        let mut query: Vec<(&str, String)> = Vec::new();
        if let Some(params) = params {
            if let Some(limit) = params.limit {
                query.push(("limit", limit.to_string()));
            }
            if let Some(offset) = params.offset {
                query.push(("offset", offset.to_string()));
            }
            if let Some(kind) = &params.kind {
                query.push(("kind", kind.clone()));
            }
            if let Some(category) = &params.category {
                query.push(("category", category.clone()));
            }
            if let Some(since) = &params.since {
                query.push(("since", since.clone()));
            }
        }
        self.http
            .websocket(&append_query("/activity/stream", &query), false)
    }
}
