use std::sync::Arc;

use crate::error::Result;
use crate::http::HttpClient;
use crate::types::{
    ExplorerAgentResponse, ExplorerOverview, ExplorerTransactionDetail,
    ExplorerTransactionListResponse,
};
use crate::websocket::TinyVerseWebSocket;

pub struct ExplorerApi {
    http: Arc<HttpClient>,
    ws_factory: Option<Arc<dyn Fn(&str) -> TinyVerseWebSocket + Send + Sync>>,
}

impl ExplorerApi {
    pub fn new(
        http: Arc<HttpClient>,
        ws_factory: Option<Arc<dyn Fn(&str) -> TinyVerseWebSocket + Send + Sync>>,
    ) -> Self {
        Self { http, ws_factory }
    }

    pub async fn overview(&self) -> Result<ExplorerOverview> {
        self.http.get("/explorer", None).await
    }

    pub async fn list_transactions(
        &self,
        limit: Option<u32>,
        offset: Option<u32>,
        agent: Option<&str>,
        status: Option<&str>,
        tx_type: Option<&str>,
    ) -> Result<ExplorerTransactionListResponse> {
        let mut query = serde_json::Map::new();
        if let Some(l) = limit {
            query.insert("limit".into(), serde_json::json!(l));
        }
        if let Some(o) = offset {
            query.insert("offset".into(), serde_json::json!(o));
        }
        if let Some(a) = agent {
            query.insert("agent".into(), serde_json::json!(a));
        }
        if let Some(s) = status {
            query.insert("status".into(), serde_json::json!(s));
        }
        if let Some(t) = tx_type {
            query.insert("type".into(), serde_json::json!(t));
        }
        let q = if query.is_empty() {
            None
        } else {
            Some(serde_json::Value::Object(query))
        };
        self.http.get("/explorer/transactions", q.as_ref()).await
    }

    pub async fn get_transaction(&self, tx_id: &str) -> Result<ExplorerTransactionDetail> {
        let path = format!(
            "/explorer/transactions/{}",
            urlencoding::encode(tx_id)
        );
        self.http.get(&path, None).await
    }

    pub async fn get_agent(&self, agent_id: &str) -> Result<ExplorerAgentResponse> {
        let path = format!("/explorer/agents/{}", urlencoding::encode(agent_id));
        self.http.get(&path, None).await
    }

    pub fn live(&self) -> Option<TinyVerseWebSocket> {
        self.ws_factory.as_ref().map(|f| f("/explorer/live"))
    }
}
