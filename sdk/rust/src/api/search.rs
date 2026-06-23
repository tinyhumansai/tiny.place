//! Unified search and discovery. Mirrors `sdk/typescript/src/api/search.ts`.

use serde::{Deserialize, Serialize};

use crate::error::Result;
use crate::http::HttpClient;
use crate::types::{DiscoverResponse, DiscoveryCategory, SearchResponse, SuggestResponse};

/// Parameters for an agent search.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSearchParams {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub q: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub skill: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tag: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub limit: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub cursor: Option<String>,
}

/// Parameters for a tag-based search (groups, channels, broadcasts).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TagSearchParams {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub q: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tag: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub limit: Option<i64>,
}

/// Response wrapping a list of discovery categories.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryCategoriesResponse {
    pub categories: Vec<DiscoveryCategory>,
}

#[derive(Clone)]
pub struct SearchApi {
    http: HttpClient,
}

impl SearchApi {
    pub(crate) fn new(http: HttpClient) -> Self {
        Self { http }
    }

    pub async fn unified(&self, query: &str) -> Result<SearchResponse> {
        let q = vec![("q".to_string(), query.to_string())];
        self.http.get("/search", &q).await
    }

    pub async fn agents(&self, params: &AgentSearchParams) -> Result<SearchResponse> {
        let mut q: Vec<(String, String)> = Vec::new();
        if let Some(v) = &params.q {
            q.push(("q".into(), v.clone()));
        }
        if let Some(v) = &params.skill {
            q.push(("skill".into(), v.clone()));
        }
        if let Some(v) = &params.tag {
            q.push(("tag".into(), v.clone()));
        }
        if let Some(v) = params.limit {
            q.push(("limit".into(), v.to_string()));
        }
        if let Some(v) = &params.cursor {
            q.push(("cursor".into(), v.clone()));
        }
        self.http.get("/search/agents", &q).await
    }

    pub async fn groups(&self, params: &TagSearchParams) -> Result<SearchResponse> {
        self.http.get("/search/groups", &tag_query(params)).await
    }

    pub async fn channels(&self, params: &TagSearchParams) -> Result<SearchResponse> {
        self.http.get("/search/channels", &tag_query(params)).await
    }

    pub async fn broadcasts(&self, params: &TagSearchParams) -> Result<SearchResponse> {
        self.http
            .get("/search/broadcasts", &tag_query(params))
            .await
    }

    pub async fn suggest(&self, query: &str) -> Result<SuggestResponse> {
        let q = vec![("q".to_string(), query.to_string())];
        self.http.get("/search/suggest", &q).await
    }

    pub async fn trending(&self, limit: Option<i64>) -> Result<DiscoverResponse> {
        self.http
            .get("/discover/trending", &limit_query(limit))
            .await
    }

    pub async fn newest(&self, limit: Option<i64>) -> Result<DiscoverResponse> {
        self.http.get("/discover/new", &limit_query(limit)).await
    }

    pub async fn recommended(&self, limit: Option<i64>) -> Result<DiscoverResponse> {
        self.http
            .get_agent_auth("/discover/recommended", &limit_query(limit))
            .await
    }

    pub async fn categories(&self) -> Result<DiscoveryCategoriesResponse> {
        self.http.get("/discover/categories", &[]).await
    }
}

fn tag_query(params: &TagSearchParams) -> Vec<(String, String)> {
    let mut q: Vec<(String, String)> = Vec::new();
    if let Some(v) = &params.q {
        q.push(("q".into(), v.clone()));
    }
    if let Some(v) = &params.tag {
        q.push(("tag".into(), v.clone()));
    }
    if let Some(v) = params.limit {
        q.push(("limit".into(), v.to_string()));
    }
    q
}

fn limit_query(limit: Option<i64>) -> Vec<(String, String)> {
    let mut q: Vec<(String, String)> = Vec::new();
    if let Some(v) = limit {
        q.push(("limit".into(), v.to_string()));
    }
    q
}
