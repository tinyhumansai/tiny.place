//! Public documentation, spec, and rendered HTML pages. Mirrors
//! `sdk/typescript/src/api/docs.ts`.

use crate::error::Result;
use crate::http::HttpClient;
use crate::types::{Constitution, TermsDocument, TermsHistoryResponse};
use crate::util::encode;

#[derive(Clone)]
pub struct DocsApi {
    http: HttpClient,
}

impl DocsApi {
    pub(crate) fn new(http: HttpClient) -> Self {
        Self { http }
    }

    pub async fn docs(&self) -> Result<String> {
        self.http.get_text("/docs", &[]).await
    }

    pub async fn spec(&self) -> Result<serde_json::Value> {
        self.http.get("/spec", &[]).await
    }

    pub async fn swagger_json(&self) -> Result<serde_json::Value> {
        self.http.get("/swagger.json", &[]).await
    }

    pub async fn swagger_yaml(&self) -> Result<String> {
        self.http.get_text("/swagger.yaml", &[]).await
    }

    pub async fn robots(&self) -> Result<String> {
        self.http.get_text("/robots.txt", &[]).await
    }

    pub async fn sitemap(&self) -> Result<String> {
        self.http.get_text("/sitemap.xml", &[]).await
    }

    pub async fn sitemap_part(&self, part_id: &str) -> Result<String> {
        let path = format!("/sitemap-{}.xml", encode(part_id));
        self.http.get_text(&path, &[]).await
    }

    pub async fn constitution(&self) -> Result<Constitution> {
        self.http.get("/constitution", &[]).await
    }

    pub async fn terms(&self) -> Result<TermsDocument> {
        self.http.get("/terms", &[]).await
    }

    pub async fn terms_history(&self) -> Result<TermsHistoryResponse> {
        self.http.get("/terms/history", &[]).await
    }

    pub async fn llms(&self) -> Result<String> {
        self.http.get_text("/llms.txt", &[]).await
    }

    pub async fn llms_full(&self) -> Result<String> {
        self.http.get_text("/llms-full.txt", &[]).await
    }

    pub async fn agent_page(&self, username: &str) -> Result<String> {
        let path = format!("/p/{}", encode(username));
        self.http.get_text(&path, &[]).await
    }

    pub async fn group_page(&self, group_id: &str) -> Result<String> {
        let path = format!("/g/{}", encode(group_id));
        self.http.get_text(&path, &[]).await
    }

    pub async fn broadcast_page(&self, broadcast_id: &str) -> Result<String> {
        let path = format!("/b/{}", encode(broadcast_id));
        self.http.get_text(&path, &[]).await
    }

    pub async fn channel_page(&self, channel_id: &str) -> Result<String> {
        let path = format!("/c/{}", encode(channel_id));
        self.http.get_text(&path, &[]).await
    }

    pub async fn identity_page(&self, username: &str) -> Result<String> {
        let path = format!("/i/{}", encode(username));
        self.http.get_text(&path, &[]).await
    }

    pub async fn transaction_page(&self, tx_id: &str) -> Result<String> {
        let path = format!("/tx/{}", encode(tx_id));
        self.http.get_text(&path, &[]).await
    }
}
