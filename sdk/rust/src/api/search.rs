use std::sync::Arc;

use serde::{Deserialize, Serialize};

use crate::error::Result;
use crate::http::HttpClient;
use crate::types::{DiscoverResponse, DiscoveryCategory, SearchResponse, SuggestResponse};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryListResponse {
    pub categories: Vec<DiscoveryCategory>,
}

pub struct SearchApi {
    http: Arc<HttpClient>,
}

impl SearchApi {
    pub fn new(http: Arc<HttpClient>) -> Self {
        Self { http }
    }

    pub async fn unified(&self, query: &str) -> Result<SearchResponse> {
        let q = serde_json::json!({ "q": query });
        self.http.get("/search", Some(&q)).await
    }

    pub async fn agents(
        &self,
        q: Option<&str>,
        skill: Option<&str>,
        tag: Option<&str>,
        limit: Option<u32>,
        cursor: Option<&str>,
    ) -> Result<SearchResponse> {
        let mut query = serde_json::Map::new();
        if let Some(v) = q {
            query.insert("q".into(), serde_json::json!(v));
        }
        if let Some(v) = skill {
            query.insert("skill".into(), serde_json::json!(v));
        }
        if let Some(v) = tag {
            query.insert("tag".into(), serde_json::json!(v));
        }
        if let Some(v) = limit {
            query.insert("limit".into(), serde_json::json!(v));
        }
        if let Some(v) = cursor {
            query.insert("cursor".into(), serde_json::json!(v));
        }
        let qv = serde_json::Value::Object(query);
        self.http.get("/search/agents", Some(&qv)).await
    }

    pub async fn groups(
        &self,
        q: Option<&str>,
        tag: Option<&str>,
        limit: Option<u32>,
    ) -> Result<SearchResponse> {
        let mut query = serde_json::Map::new();
        if let Some(v) = q {
            query.insert("q".into(), serde_json::json!(v));
        }
        if let Some(v) = tag {
            query.insert("tag".into(), serde_json::json!(v));
        }
        if let Some(v) = limit {
            query.insert("limit".into(), serde_json::json!(v));
        }
        let qv = serde_json::Value::Object(query);
        self.http.get("/search/groups", Some(&qv)).await
    }

    pub async fn channels(
        &self,
        q: Option<&str>,
        tag: Option<&str>,
        limit: Option<u32>,
    ) -> Result<SearchResponse> {
        let mut query = serde_json::Map::new();
        if let Some(v) = q {
            query.insert("q".into(), serde_json::json!(v));
        }
        if let Some(v) = tag {
            query.insert("tag".into(), serde_json::json!(v));
        }
        if let Some(v) = limit {
            query.insert("limit".into(), serde_json::json!(v));
        }
        let qv = serde_json::Value::Object(query);
        self.http.get("/search/channels", Some(&qv)).await
    }

    pub async fn broadcasts(
        &self,
        q: Option<&str>,
        tag: Option<&str>,
        limit: Option<u32>,
    ) -> Result<SearchResponse> {
        let mut query = serde_json::Map::new();
        if let Some(v) = q {
            query.insert("q".into(), serde_json::json!(v));
        }
        if let Some(v) = tag {
            query.insert("tag".into(), serde_json::json!(v));
        }
        if let Some(v) = limit {
            query.insert("limit".into(), serde_json::json!(v));
        }
        let qv = serde_json::Value::Object(query);
        self.http.get("/search/broadcasts", Some(&qv)).await
    }

    pub async fn events(
        &self,
        q: Option<&str>,
        tag: Option<&str>,
        limit: Option<u32>,
    ) -> Result<SearchResponse> {
        let mut query = serde_json::Map::new();
        if let Some(v) = q {
            query.insert("q".into(), serde_json::json!(v));
        }
        if let Some(v) = tag {
            query.insert("tag".into(), serde_json::json!(v));
        }
        if let Some(v) = limit {
            query.insert("limit".into(), serde_json::json!(v));
        }
        let qv = serde_json::Value::Object(query);
        self.http.get("/search/events", Some(&qv)).await
    }

    pub async fn products(
        &self,
        q: Option<&str>,
        category: Option<&str>,
        limit: Option<u32>,
    ) -> Result<SearchResponse> {
        let mut query = serde_json::Map::new();
        if let Some(v) = q {
            query.insert("q".into(), serde_json::json!(v));
        }
        if let Some(v) = category {
            query.insert("category".into(), serde_json::json!(v));
        }
        if let Some(v) = limit {
            query.insert("limit".into(), serde_json::json!(v));
        }
        let qv = serde_json::Value::Object(query);
        self.http.get("/search/products", Some(&qv)).await
    }

    pub async fn suggest(&self, query: &str) -> Result<SuggestResponse> {
        let q = serde_json::json!({ "q": query });
        self.http.get("/search/suggest", Some(&q)).await
    }

    pub async fn trending(&self, limit: Option<u32>) -> Result<DiscoverResponse> {
        let query = limit.map(|l| serde_json::json!({ "limit": l }));
        self.http
            .get("/discover/trending", query.as_ref())
            .await
    }

    pub async fn newest(&self, limit: Option<u32>) -> Result<DiscoverResponse> {
        let query = limit.map(|l| serde_json::json!({ "limit": l }));
        self.http.get("/discover/new", query.as_ref()).await
    }

    pub async fn recommended(&self, limit: Option<u32>) -> Result<DiscoverResponse> {
        let query = limit.map(|l| serde_json::json!({ "limit": l }));
        self.http
            .get_auth("/discover/recommended", query.as_ref())
            .await
    }

    pub async fn categories(&self) -> Result<CategoryListResponse> {
        self.http.get("/discover/categories", None).await
    }
}
