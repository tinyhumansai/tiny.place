use std::collections::HashMap;
use std::sync::Arc;

use serde::{Deserialize, Serialize};

use crate::error::Result;
use crate::http::{HttpClient, to_body, to_query};
use crate::types::{AdminAuditEntry, AgentPaymentStatus, FeeConfig};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeeListResponse {
    pub fees: Vec<FeeConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeeResolveResponse {
    pub fee_rate: String,
    pub resolved: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigResponse {
    pub config: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditResponse {
    pub records: Vec<AdminAuditEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeeMetricsResponse {
    pub revenue: String,
    pub by_agent: HashMap<String, String>,
    pub by_asset: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub actor: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SuspendParams {
    pub until: String,
    pub reason: String,
}

pub struct AdminApi {
    http: Arc<HttpClient>,
}

impl AdminApi {
    pub fn new(http: Arc<HttpClient>) -> Self {
        Self { http }
    }

    pub async fn list_fees(&self) -> Result<FeeListResponse> {
        self.http.get_auth("/admin/fees", None).await
    }

    pub async fn create_fee(&self, fee: &serde_json::Value) -> Result<FeeConfig> {
        self.http.post("/admin/fees", Some(fee)).await
    }

    pub async fn get_fee(&self, fee_id: &str) -> Result<FeeConfig> {
        let path = format!("/admin/fees/{}", urlencoding::encode(fee_id));
        self.http.get_auth(&path, None).await
    }

    pub async fn update_fee(
        &self,
        fee_id: &str,
        update: &serde_json::Value,
    ) -> Result<FeeConfig> {
        let path = format!("/admin/fees/{}", urlencoding::encode(fee_id));
        self.http.put(&path, Some(update)).await
    }

    pub async fn delete_fee(&self, fee_id: &str) -> Result<()> {
        let path = format!("/admin/fees/{}", urlencoding::encode(fee_id));
        self.http.delete(&path, None).await
    }

    pub async fn resolve_fee(
        &self,
        agent1: &str,
        agent2: &str,
    ) -> Result<FeeResolveResponse> {
        let query = serde_json::json!({ "agent1": agent1, "agent2": agent2 });
        self.http.get_auth("/admin/fees/resolve", Some(&query)).await
    }

    pub async fn get_agent_status(&self, agent_id: &str) -> Result<AgentPaymentStatus> {
        let path = format!("/admin/agents/{}/status", urlencoding::encode(agent_id));
        self.http.get_auth(&path, None).await
    }

    pub async fn suspend_agent(
        &self,
        agent_id: &str,
        params: &SuspendParams,
    ) -> Result<AgentPaymentStatus> {
        let path = format!("/admin/agents/{}/suspend", urlencoding::encode(agent_id));
        self.http.post(&path, Some(&to_body(params)?)).await
    }

    pub async fn get_config(&self) -> Result<ConfigResponse> {
        self.http.get_auth("/admin/config", None).await
    }

    pub async fn set_config(&self, key: &str, value: &str) -> Result<()> {
        let path = format!("/admin/config/{}", urlencoding::encode(key));
        let body = serde_json::json!({ "value": value });
        self.http.put(&path, Some(&body)).await
    }

    pub async fn audit(&self, params: Option<&AuditParams>) -> Result<AuditResponse> {
        let query = params.map(to_query).transpose()?;
        self.http
            .get_auth("/admin/audit", query.as_ref())
            .await
    }

    pub async fn fee_metrics(&self, period: Option<&str>) -> Result<FeeMetricsResponse> {
        let query = period.map(|p| serde_json::json!({ "period": p }));
        self.http
            .get_auth("/admin/metrics/fees", query.as_ref())
            .await
    }
}
