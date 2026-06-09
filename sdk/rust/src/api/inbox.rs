use std::sync::Arc;

use serde::{Deserialize, Serialize};

use crate::error::Result;
use crate::http::{HttpClient, to_query};
use crate::types::{InboxCounts, InboxItem, InboxListResult, InboxQueryParams};
use crate::websocket::TinyVerseWebSocket;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxSearchResponse {
    pub items: Vec<InboxItem>,
}

pub struct InboxApi {
    http: Arc<HttpClient>,
    ws_factory: Option<Arc<dyn Fn(&str) -> TinyVerseWebSocket + Send + Sync>>,
}

impl InboxApi {
    pub fn new(
        http: Arc<HttpClient>,
        ws_factory: Option<Arc<dyn Fn(&str) -> TinyVerseWebSocket + Send + Sync>>,
    ) -> Self {
        Self { http, ws_factory }
    }

    pub async fn list(&self, params: Option<&InboxQueryParams>) -> Result<InboxListResult> {
        let query = params.map(to_query).transpose()?;
        self.http.get_auth("/inbox", query.as_ref()).await
    }

    pub async fn get(&self, item_id: &str) -> Result<InboxItem> {
        let path = format!("/inbox/{}", urlencoding::encode(item_id));
        self.http.get_auth(&path, None).await
    }

    pub async fn search(&self, query: &str) -> Result<InboxSearchResponse> {
        let q = serde_json::json!({ "q": query });
        self.http.get_auth("/inbox/search", Some(&q)).await
    }

    pub async fn counts(&self) -> Result<InboxCounts> {
        self.http.get_auth("/inbox/counts", None).await
    }

    pub async fn mark_read(&self, item_id: &str) -> Result<InboxItem> {
        let path = format!("/inbox/{}/read", urlencoding::encode(item_id));
        self.http.put(&path, None).await
    }

    pub async fn mark_read_bulk(&self, item_ids: &[String]) -> Result<()> {
        let body = serde_json::json!({ "itemIds": item_ids });
        self.http.put("/inbox/read", Some(&body)).await
    }

    pub async fn mark_all_read(&self) -> Result<()> {
        self.http.put("/inbox/read-all", None).await
    }

    pub async fn archive(&self, item_id: &str) -> Result<InboxItem> {
        let path = format!("/inbox/{}/archive", urlencoding::encode(item_id));
        self.http.put(&path, None).await
    }

    pub async fn archive_bulk(&self, item_ids: &[String]) -> Result<()> {
        let body = serde_json::json!({ "itemIds": item_ids });
        self.http.put("/inbox/archive", Some(&body)).await
    }

    pub async fn unarchive(&self, item_id: &str) -> Result<InboxItem> {
        let path = format!("/inbox/{}/unarchive", urlencoding::encode(item_id));
        self.http.put(&path, None).await
    }

    pub async fn remove(&self, item_id: &str) -> Result<()> {
        let path = format!("/inbox/{}", urlencoding::encode(item_id));
        self.http.delete(&path, None).await
    }

    pub async fn remove_bulk(&self, item_ids: &[String]) -> Result<()> {
        let body = serde_json::json!({ "itemIds": item_ids });
        self.http.delete("/inbox", Some(&body)).await
    }

    pub async fn clear(&self) -> Result<()> {
        self.http.delete("/inbox/clear", None).await
    }

    pub fn stream(&self) -> Option<TinyVerseWebSocket> {
        self.ws_factory.as_ref().map(|f| f("/inbox/stream"))
    }
}
