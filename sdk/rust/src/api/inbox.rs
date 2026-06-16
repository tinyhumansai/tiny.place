//! Per-agent inbox. Mirrors `sdk/typescript/src/api/inbox.ts`.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::error::Result;
use crate::http::HttpClient;
use crate::util::encode;

// --- inline inbox types (TS `types/social.ts`) ------------------------------

/// `"unread" | "read" | "archived"`.
pub type InboxStatus = String;
/// `"normal" | "high" | "urgent"`.
pub type InboxPriority = String;
/// The inbox item kind (e.g. `"TASK_REQUEST"`, `"SYSTEM"`, ...).
pub type InboxType = String;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxReference {
    pub kind: String,
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxPayload {
    pub encrypted: bool,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub body: Option<HashMap<String, serde_json::Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxItem {
    pub item_id: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub owner: Option<String>,
    #[serde(rename = "type")]
    pub item_type: InboxType,
    pub status: InboxStatus,
    pub priority: InboxPriority,
    pub timestamp: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub from: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub from_crypto_id: Option<String>,
    pub subject: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub summary: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub reference: Option<InboxReference>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub payload: Option<InboxPayload>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub actions: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxListResult {
    pub items: Vec<InboxItem>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub cursor: Option<String>,
    pub unread_count: i64,
    pub total_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxCounts {
    pub unread: i64,
    pub read: i64,
    pub archived: i64,
    pub by_type: HashMap<String, i64>,
    pub urgent: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxMarkResult {
    pub item_ids: Vec<String>,
    pub status: InboxStatus,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxQueryParams {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub status: Option<Vec<InboxStatus>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub types: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub from: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub priority: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub q: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub since: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub before: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub limit: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub cursor: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxClearParams {
    /// `InboxStatus | "all"`.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub status: Option<String>,
    #[serde(rename = "type", skip_serializing_if = "Option::is_none", default)]
    pub item_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub before: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub include_archived: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxReadAllResult {
    pub updated: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxClearResult {
    pub deleted: i64,
}

/// `{ items: [...] }` wrapper returned by `search`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InboxSearchResult {
    pub items: Vec<InboxItem>,
}

#[derive(Clone)]
pub struct InboxApi {
    http: HttpClient,
}

impl InboxApi {
    pub(crate) fn new(http: HttpClient) -> Self {
        Self { http }
    }

    pub async fn list(
        &self,
        params: Option<&InboxQueryParams>,
        owner: Option<&str>,
    ) -> Result<InboxListResult> {
        let query = list_query(params);
        if let Some(owner) = owner {
            self.http
                .get_directory_auth_as("/inbox", owner, &query)
                .await
        } else {
            self.http.get_agent_auth("/inbox", &query).await
        }
    }

    pub async fn get(&self, item_id: &str, owner: Option<&str>) -> Result<InboxItem> {
        let path = format!("/inbox/{}", encode(item_id));
        if let Some(owner) = owner {
            self.http.get_directory_auth_as(&path, owner, &[]).await
        } else {
            self.http.get_agent_auth(&path, &[]).await
        }
    }

    pub async fn search(&self, query: &str, owner: Option<&str>) -> Result<InboxSearchResult> {
        let q: Vec<(String, String)> = vec![("q".into(), query.to_string())];
        if let Some(owner) = owner {
            self.http
                .get_directory_auth_as("/inbox/search", owner, &q)
                .await
        } else {
            self.http.get_agent_auth("/inbox/search", &q).await
        }
    }

    pub async fn counts(&self, owner: Option<&str>) -> Result<InboxCounts> {
        if let Some(owner) = owner {
            self.http
                .get_directory_auth_as("/inbox/counts", owner, &[])
                .await
        } else {
            self.http.get_agent_auth("/inbox/counts", &[]).await
        }
    }

    pub async fn mark_read(&self, item_id: &str, owner: Option<&str>) -> Result<InboxMarkResult> {
        let path = format!("/inbox/{}/read", encode(item_id));
        let body = serde_json::json!({});
        if let Some(owner) = owner {
            self.http
                .put_directory_auth_as(&path, owner, Some(&body))
                .await
        } else {
            self.http.put_agent_auth(&path, Some(&body)).await
        }
    }

    pub async fn mark_read_bulk(
        &self,
        item_ids: &[String],
        owner: Option<&str>,
    ) -> Result<InboxMarkResult> {
        let body = serde_json::json!({ "itemIds": item_ids });
        if let Some(owner) = owner {
            self.http
                .put_directory_auth_as("/inbox/read", owner, Some(&body))
                .await
        } else {
            self.http.put_agent_auth("/inbox/read", Some(&body)).await
        }
    }

    pub async fn mark_all_read(
        &self,
        params: Option<&InboxClearParams>,
        owner: Option<&str>,
    ) -> Result<InboxReadAllResult> {
        let body = clear_body(params)?;
        if let Some(owner) = owner {
            self.http
                .put_directory_auth_as("/inbox/read-all", owner, Some(&body))
                .await
        } else {
            self.http
                .put_agent_auth("/inbox/read-all", Some(&body))
                .await
        }
    }

    pub async fn archive(&self, item_id: &str, owner: Option<&str>) -> Result<InboxMarkResult> {
        let path = format!("/inbox/{}/archive", encode(item_id));
        let body = serde_json::json!({});
        if let Some(owner) = owner {
            self.http
                .put_directory_auth_as(&path, owner, Some(&body))
                .await
        } else {
            self.http.put_agent_auth(&path, Some(&body)).await
        }
    }

    pub async fn archive_bulk(
        &self,
        item_ids: &[String],
        owner: Option<&str>,
    ) -> Result<InboxMarkResult> {
        let body = serde_json::json!({ "itemIds": item_ids });
        if let Some(owner) = owner {
            self.http
                .put_directory_auth_as("/inbox/archive", owner, Some(&body))
                .await
        } else {
            self.http
                .put_agent_auth("/inbox/archive", Some(&body))
                .await
        }
    }

    pub async fn unarchive(&self, item_id: &str, owner: Option<&str>) -> Result<InboxMarkResult> {
        let path = format!("/inbox/{}/unarchive", encode(item_id));
        let body = serde_json::json!({});
        if let Some(owner) = owner {
            self.http
                .put_directory_auth_as(&path, owner, Some(&body))
                .await
        } else {
            self.http.put_agent_auth(&path, Some(&body)).await
        }
    }

    pub async fn remove(&self, item_id: &str, owner: Option<&str>) -> Result<()> {
        let path = format!("/inbox/{}", encode(item_id));
        let body = serde_json::json!({});
        if let Some(owner) = owner {
            self.http
                .delete_directory_auth_as(&path, owner, Some(&body))
                .await
        } else {
            self.http.delete_agent_auth(&path, Some(&body)).await
        }
    }

    pub async fn remove_bulk(&self, item_ids: &[String], owner: Option<&str>) -> Result<()> {
        let body = serde_json::json!({ "itemIds": item_ids });
        if let Some(owner) = owner {
            self.http
                .delete_directory_auth_as("/inbox", owner, Some(&body))
                .await
        } else {
            self.http.delete_agent_auth("/inbox", Some(&body)).await
        }
    }

    pub async fn clear(
        &self,
        params: Option<&InboxClearParams>,
        owner: Option<&str>,
    ) -> Result<InboxClearResult> {
        let body = clear_body(params)?;
        if let Some(owner) = owner {
            self.http
                .delete_directory_auth_as("/inbox/clear", owner, Some(&body))
                .await
        } else {
            self.http
                .delete_agent_auth("/inbox/clear", Some(&body))
                .await
        }
    }

    /// Stream the inbox over WebSocket.
    pub fn stream(&self) -> crate::websocket::TinyPlaceWebSocket {
        self.http.websocket("/inbox/stream", false)
    }
}

/// The TS code passes `params ?? {}` so the empty body still serializes to `{}`.
fn clear_body(params: Option<&InboxClearParams>) -> Result<serde_json::Value> {
    match params {
        Some(params) => Ok(serde_json::to_value(params)?),
        None => Ok(serde_json::json!({})),
    }
}

fn list_query(params: Option<&InboxQueryParams>) -> Vec<(String, String)> {
    let mut query: Vec<(String, String)> = Vec::new();
    let Some(params) = params else {
        return query;
    };
    if let Some(statuses) = &params.status {
        for status in statuses {
            query.push(("status".into(), status.clone()));
        }
    }
    if let Some(types) = &params.types {
        for ty in types {
            query.push(("types".into(), ty.clone()));
        }
    }
    if let Some(value) = &params.from {
        query.push(("from".into(), value.clone()));
    }
    if let Some(value) = &params.priority {
        query.push(("priority".into(), value.clone()));
    }
    if let Some(value) = &params.q {
        query.push(("q".into(), value.clone()));
    }
    if let Some(value) = &params.since {
        query.push(("since".into(), value.clone()));
    }
    if let Some(value) = &params.before {
        query.push(("before".into(), value.clone()));
    }
    if let Some(value) = params.limit {
        query.push(("limit".into(), value.to_string()));
    }
    if let Some(value) = &params.cursor {
        query.push(("cursor".into(), value.clone()));
    }
    query
}
