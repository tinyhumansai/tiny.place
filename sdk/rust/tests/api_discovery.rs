//! Endpoint tests for the discovery surface: `SearchApi`, `McpApi`, and
//! `DocsApi`. Each test points the client at a
//! catch-all mock, invokes a method, and asserts the request method + path.
//! Response bodies are permissive — the goal is to exercise request
//! construction and the response pipeline, not parsing.

mod common;

use common::*;
use serde_json::json;
use tinyplace::api::search::{AgentSearchParams, TagSearchParams};
use tinyplace::types::McpJsonRpcRequest;

// --- SearchApi ---

#[tokio::test]
async fn search_unified() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.search.unified("x").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/search"));
}

#[tokio::test]
async fn search_agents() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.search.agents(&AgentSearchParams::default()).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/search/agents"));
}

#[tokio::test]
async fn search_groups() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.search.groups(&TagSearchParams::default()).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/search/groups"));
}

#[tokio::test]
async fn search_channels() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.search.channels(&TagSearchParams::default()).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/search/channels"));
}

#[tokio::test]
async fn search_broadcasts() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.search.broadcasts(&TagSearchParams::default()).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/search/broadcasts"));
}

#[tokio::test]
async fn search_suggest() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.search.suggest("x").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/search/suggest"));
}

#[tokio::test]
async fn search_trending() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.search.trending(None).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/discover/trending"));
}

#[tokio::test]
async fn search_newest() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.search.newest(None).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/discover/new"));
}

#[tokio::test]
async fn search_recommended() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.search.recommended(None).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/discover/recommended"));
}

#[tokio::test]
async fn search_categories() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.search.categories().await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/discover/categories"));
}

// --- McpApi ---

#[tokio::test]
async fn mcp_request() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let msg = McpJsonRpcRequest {
        jsonrpc: "2.0".to_string(),
        id: Some(json!(1)),
        method: "ping".to_string(),
        params: None,
    };
    let _ = client.mcp.request::<serde_json::Value>(&msg, None).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("/mcp"));
}

#[tokio::test]
async fn mcp_initialize() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.mcp.initialize(None, None).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("/mcp"));
}

#[tokio::test]
async fn mcp_list_tools() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.mcp.list_tools(None).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("/mcp"));
}

#[tokio::test]
async fn mcp_list_resources() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.mcp.list_resources(None).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("/mcp"));
}

#[tokio::test]
async fn mcp_list_prompts() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.mcp.list_prompts(None).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("/mcp"));
}

#[tokio::test]
async fn mcp_stream() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.mcp.stream(None).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/mcp"));
}

#[tokio::test]
async fn mcp_terminate() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.mcp.terminate(None).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "DELETE");
    assert!(req.url.path().contains("/mcp"));
}

// --- DocsApi ---

#[tokio::test]
async fn docs_docs() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.docs.docs().await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/docs"));
}

#[tokio::test]
async fn docs_spec() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.docs.spec().await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/spec"));
}

#[tokio::test]
async fn docs_swagger_json() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.docs.swagger_json().await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/swagger.json"));
}

#[tokio::test]
async fn docs_swagger_yaml() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.docs.swagger_yaml().await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/swagger.yaml"));
}

#[tokio::test]
async fn docs_robots() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.docs.robots().await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/robots.txt"));
}

#[tokio::test]
async fn docs_sitemap() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.docs.sitemap().await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/sitemap.xml"));
}

#[tokio::test]
async fn docs_sitemap_part() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.docs.sitemap_part("1").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/sitemap-"));
}

#[tokio::test]
async fn docs_constitution() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.docs.constitution().await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/constitution"));
}

#[tokio::test]
async fn docs_terms() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.docs.terms().await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/terms"));
}

#[tokio::test]
async fn docs_terms_history() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.docs.terms_history().await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/terms/history"));
}

#[tokio::test]
async fn docs_llms() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.docs.llms().await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/llms.txt"));
}

#[tokio::test]
async fn docs_llms_full() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.docs.llms_full().await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/llms-full.txt"));
}

#[tokio::test]
async fn docs_agent_page() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.docs.agent_page("alice").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/p/"));
}

#[tokio::test]
async fn docs_group_page() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.docs.group_page("g1").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/g/"));
}

#[tokio::test]
async fn docs_broadcast_page() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.docs.broadcast_page("b1").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/b/"));
}

#[tokio::test]
async fn docs_channel_page() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.docs.channel_page("c1").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/c/"));
}

#[tokio::test]
async fn docs_identity_page() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.docs.identity_page("alice").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/i/"));
}

#[tokio::test]
async fn docs_transaction_page() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.docs.transaction_page("tx1").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/tx/"));
}
