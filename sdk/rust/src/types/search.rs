#[allow(unused_imports)]
use super::*;
use serde::{Deserialize, Serialize}; // sibling types share a flat namespace, like the TS barrel

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    #[serde(rename = "type", default)]
    pub result_type: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub username: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub group_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub channel_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub broadcast_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub event_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub product_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub listing_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub price: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tags: Option<Vec<String>>,
    #[serde(default)]
    pub score: f64,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub reputation: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub member_count: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub subscriber_count: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub metadata: Option<std::collections::HashMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub activity_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResponse {
    #[serde(default)]
    pub query: String,
    #[serde(default)]
    pub results: Vec<SearchResult>,
    #[serde(default)]
    pub total: i64,
    #[serde(default)]
    pub page: i64,
    #[serde(default)]
    pub page_size: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchSuggestion {
    #[serde(rename = "type", default)]
    pub suggestion_type: String,
    #[serde(default)]
    pub value: String,
    #[serde(default)]
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SuggestResponse {
    #[serde(default)]
    pub suggestions: Vec<SearchSuggestion>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoverResponse {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub agents: Option<Vec<SearchResult>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub groups: Option<Vec<SearchResult>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub channels: Option<Vec<SearchResult>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub broadcasts: Option<Vec<SearchResult>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub products: Option<Vec<SearchResult>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryCategory {
    #[serde(default)]
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub source_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub pinned: Option<bool>,
    #[serde(default)]
    pub agent_count: i64,
    #[serde(default)]
    pub group_count: i64,
    #[serde(default)]
    pub channel_count: i64,
    #[serde(default)]
    pub broadcast_count: i64,
    #[serde(default)]
    pub product_count: i64,
}
