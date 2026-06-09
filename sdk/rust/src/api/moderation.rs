use std::sync::Arc;

use serde::{Deserialize, Serialize};

use crate::error::Result;
use crate::http::{HttpClient, to_body};
use crate::types::{
    Constitution, ModerationAction, ModerationAppeal, ModerationReport, ModerationReportCreate,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionListResponse {
    pub actions: Vec<ModerationAction>,
}

pub struct ModerationApi {
    http: Arc<HttpClient>,
}

impl ModerationApi {
    pub fn new(http: Arc<HttpClient>) -> Self {
        Self { http }
    }

    pub async fn get_constitution(&self) -> Result<Constitution> {
        self.http.get("/constitution", None).await
    }

    pub async fn create_report(
        &self,
        report: &ModerationReportCreate,
    ) -> Result<ModerationReport> {
        self.http
            .post("/moderation/reports", Some(&to_body(report)?))
            .await
    }

    pub async fn get_report(&self, report_id: &str) -> Result<ModerationReport> {
        let path = format!("/moderation/reports/{}", urlencoding::encode(report_id));
        self.http.get_auth(&path, None).await
    }

    pub async fn update_report_status(
        &self,
        report_id: &str,
        status: &str,
        note: Option<&str>,
    ) -> Result<ModerationReport> {
        let path = format!(
            "/moderation/reports/{}/status",
            urlencoding::encode(report_id)
        );
        let mut body = serde_json::json!({ "status": status });
        if let Some(n) = note {
            body["note"] = serde_json::json!(n);
        }
        self.http.put(&path, Some(&body)).await
    }

    pub async fn list_actions(
        &self,
        target: Option<&str>,
        action_type: Option<&str>,
        limit: Option<u32>,
    ) -> Result<ActionListResponse> {
        let mut query = serde_json::Map::new();
        if let Some(t) = target {
            query.insert("target".into(), serde_json::json!(t));
        }
        if let Some(at) = action_type {
            query.insert("type".into(), serde_json::json!(at));
        }
        if let Some(l) = limit {
            query.insert("limit".into(), serde_json::json!(l));
        }
        let q = if query.is_empty() {
            None
        } else {
            Some(serde_json::Value::Object(query))
        };
        self.http.get("/moderation/actions", q.as_ref()).await
    }

    pub async fn create_action(
        &self,
        action: &serde_json::Value,
    ) -> Result<ModerationAction> {
        self.http
            .post("/moderation/actions", Some(action))
            .await
    }

    pub async fn create_appeal(
        &self,
        action_id: &str,
        comment: Option<&str>,
    ) -> Result<ModerationAppeal> {
        let mut body = serde_json::json!({ "actionId": action_id });
        if let Some(c) = comment {
            body["comment"] = serde_json::json!(c);
        }
        self.http
            .post("/moderation/appeals", Some(&body))
            .await
    }

    pub async fn get_appeal(&self, appeal_id: &str) -> Result<ModerationAppeal> {
        let path = format!(
            "/moderation/appeals/{}",
            urlencoding::encode(appeal_id)
        );
        self.http.get_auth(&path, None).await
    }

    pub async fn update_appeal_status(
        &self,
        appeal_id: &str,
        status: &str,
        note: Option<&str>,
    ) -> Result<ModerationAppeal> {
        let path = format!(
            "/moderation/appeals/{}/status",
            urlencoding::encode(appeal_id)
        );
        let mut body = serde_json::json!({ "status": status });
        if let Some(n) = note {
            body["note"] = serde_json::json!(n);
        }
        self.http.put(&path, Some(&body)).await
    }
}
