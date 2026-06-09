use std::sync::Arc;

use crate::error::Result;
use crate::http::HttpClient;
use crate::types::{AgentStats, FeeStats, StatsSnapshot, TransactionStats, VolumeStats};

pub struct StatsApi {
    http: Arc<HttpClient>,
}

impl StatsApi {
    pub fn new(http: Arc<HttpClient>) -> Self {
        Self { http }
    }

    pub async fn overview(&self) -> Result<StatsSnapshot> {
        self.http.get("/stats", None).await
    }

    pub async fn agents(&self) -> Result<AgentStats> {
        self.http.get("/stats/agents", None).await
    }

    pub async fn transactions(&self) -> Result<TransactionStats> {
        self.http.get("/stats/transactions", None).await
    }

    pub async fn volume(&self) -> Result<VolumeStats> {
        self.http.get("/stats/volume", None).await
    }

    pub async fn fees(&self) -> Result<FeeStats> {
        self.http.get("/stats/fees", None).await
    }
}
