//! Public transaction explorer (`/explorer`).

use crate::error::Result;
use crate::http::HttpClient;
use crate::types::{
    ExplorerAgentResponse, ExplorerOverview, ExplorerTransactionDetail,
    ExplorerTransactionListResponse, ExplorerVerification,
};
use crate::util::encode;

/// Filters for [`ExplorerApi::list_transactions`].
#[derive(Debug, Clone, Default)]
pub struct ExplorerTransactionQueryParams {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    pub agent: Option<String>,
    pub status: Option<String>,
    pub transaction_type: Option<String>,
}

#[derive(Clone)]
pub struct ExplorerApi {
    http: HttpClient,
}

impl ExplorerApi {
    pub(crate) fn new(http: HttpClient) -> Self {
        Self { http }
    }

    pub async fn root(&self) -> Result<ExplorerOverview> {
        self.http.get("/explorer", &[]).await
    }

    pub async fn overview(&self) -> Result<ExplorerOverview> {
        self.http.get("/explorer/overview", &[]).await
    }

    pub async fn list_transactions(
        &self,
        params: Option<&ExplorerTransactionQueryParams>,
    ) -> Result<ExplorerTransactionListResponse> {
        let mut q: Vec<(String, String)> = Vec::new();
        if let Some(p) = params {
            if let Some(v) = p.limit {
                q.push(("limit".into(), v.to_string()));
            }
            if let Some(v) = p.offset {
                q.push(("offset".into(), v.to_string()));
            }
            if let Some(v) = &p.agent {
                q.push(("agent".into(), v.clone()));
            }
            if let Some(v) = &p.status {
                q.push(("status".into(), v.clone()));
            }
            if let Some(v) = &p.transaction_type {
                q.push(("type".into(), v.clone()));
            }
        }
        self.http.get("/explorer/transactions", &q).await
    }

    pub async fn get_transaction(&self, tx_id: &str) -> Result<ExplorerTransactionDetail> {
        let path = format!("/explorer/transactions/{}", encode(tx_id));
        self.http.get(&path, &[]).await
    }

    pub async fn verify_transaction(&self, tx_id: &str) -> Result<ExplorerVerification> {
        let path = format!("/explorer/transactions/{}/verify", encode(tx_id));
        self.http.get(&path, &[]).await
    }

    pub async fn get_agent(&self, agent_id: &str) -> Result<ExplorerAgentResponse> {
        let path = format!("/explorer/agents/{}", encode(agent_id));
        self.http.get(&path, &[]).await
    }

    /// Open the public explorer live feed over WebSocket.
    pub fn live(&self) -> crate::websocket::TinyPlaceWebSocket {
        self.http.websocket("/explorer/live", false)
    }
}
