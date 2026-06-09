use std::sync::Arc;

use serde::{Deserialize, Serialize};

use crate::error::Result;
use crate::http::{HttpClient, to_body};
use crate::types::{
    BridgeExecution, BridgeExecuteRequest, BridgeQuote, BridgeRoute, GasEstimate, PriceHistory,
    PriceQuote, SwapExecution, SwapExecuteRequest, SwapQuote, TradePair,
};
use crate::websocket::TinyVerseWebSocket;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetInfo {
    pub symbol: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub address: Option<String>,
    pub decimals: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetListResponse {
    pub assets: Vec<AssetInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairListResponse {
    pub pairs: Vec<TradePair>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkListResponse {
    pub networks: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SwapHistoryResponse {
    pub swaps: Vec<SwapExecution>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeRouteListResponse {
    pub routes: Vec<BridgeRoute>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeHistoryResponse {
    pub bridges: Vec<BridgeExecution>,
}

pub struct PricingApi {
    http: Arc<HttpClient>,
    ws_factory: Option<Arc<dyn Fn(&str) -> TinyVerseWebSocket + Send + Sync>>,
}

impl PricingApi {
    pub fn new(
        http: Arc<HttpClient>,
        ws_factory: Option<Arc<dyn Fn(&str) -> TinyVerseWebSocket + Send + Sync>>,
    ) -> Self {
        Self { http, ws_factory }
    }

    pub async fn quote(
        &self,
        base: &str,
        quote_asset: &str,
        network: Option<&str>,
    ) -> Result<PriceQuote> {
        let mut q = serde_json::json!({ "base": base, "quote": quote_asset });
        if let Some(n) = network {
            q["network"] = serde_json::json!(n);
        }
        self.http.get("/pricing/quote", Some(&q)).await
    }

    pub async fn history(
        &self,
        base: &str,
        quote_asset: &str,
        interval: &str,
        from: Option<&str>,
        to: Option<&str>,
    ) -> Result<PriceHistory> {
        let mut q = serde_json::json!({
            "base": base,
            "quote": quote_asset,
            "interval": interval
        });
        if let Some(f) = from {
            q["from"] = serde_json::json!(f);
        }
        if let Some(t) = to {
            q["to"] = serde_json::json!(t);
        }
        self.http.get("/pricing/history", Some(&q)).await
    }

    pub async fn assets(&self) -> Result<AssetListResponse> {
        self.http.get("/pricing/assets", None).await
    }

    pub async fn pairs(&self) -> Result<PairListResponse> {
        self.http.get("/pricing/pairs", None).await
    }

    pub async fn networks(&self) -> Result<NetworkListResponse> {
        self.http.get("/pricing/networks", None).await
    }

    pub async fn gas(&self, network: &str) -> Result<GasEstimate> {
        let q = serde_json::json!({ "network": network });
        self.http.get("/pricing/gas", Some(&q)).await
    }

    pub fn price_stream(&self) -> Option<TinyVerseWebSocket> {
        self.ws_factory.as_ref().map(|f| f("/pricing/stream"))
    }

    pub async fn swap_quote(
        &self,
        from_asset: &str,
        to_asset: &str,
        amount: &str,
    ) -> Result<SwapQuote> {
        let q = serde_json::json!({
            "fromAsset": from_asset,
            "toAsset": to_asset,
            "amount": amount
        });
        self.http.get("/swap/quote", Some(&q)).await
    }

    pub async fn execute_swap(&self, request: &SwapExecuteRequest) -> Result<SwapExecution> {
        self.http
            .post("/swap/execute", Some(&to_body(request)?))
            .await
    }

    pub async fn get_swap(&self, swap_id: &str) -> Result<SwapExecution> {
        let path = format!("/swap/{}", urlencoding::encode(swap_id));
        self.http.get_auth(&path, None).await
    }

    pub async fn swap_history(
        &self,
        limit: Option<u32>,
        offset: Option<u32>,
    ) -> Result<SwapHistoryResponse> {
        let mut query = serde_json::Map::new();
        if let Some(l) = limit {
            query.insert("limit".into(), serde_json::json!(l));
        }
        if let Some(o) = offset {
            query.insert("offset".into(), serde_json::json!(o));
        }
        let q = if query.is_empty() {
            None
        } else {
            Some(serde_json::Value::Object(query))
        };
        self.http.get_auth("/swap/history", q.as_ref()).await
    }

    pub async fn bridge_routes(
        &self,
        from_chain: &str,
        to_chain: &str,
    ) -> Result<BridgeRouteListResponse> {
        let q = serde_json::json!({ "fromChain": from_chain, "toChain": to_chain });
        self.http.get("/bridge/routes", Some(&q)).await
    }

    pub async fn bridge_quote(
        &self,
        from_chain: &str,
        to_chain: &str,
        token: &str,
        amount: &str,
    ) -> Result<BridgeQuote> {
        let q = serde_json::json!({
            "fromChain": from_chain,
            "toChain": to_chain,
            "token": token,
            "amount": amount
        });
        self.http.get("/bridge/quote", Some(&q)).await
    }

    pub async fn execute_bridge(
        &self,
        request: &BridgeExecuteRequest,
    ) -> Result<BridgeExecution> {
        self.http
            .post("/bridge/execute", Some(&to_body(request)?))
            .await
    }

    pub async fn get_bridge(&self, bridge_id: &str) -> Result<BridgeExecution> {
        let path = format!("/bridge/{}", urlencoding::encode(bridge_id));
        self.http.get_auth(&path, None).await
    }

    pub async fn bridge_history(
        &self,
        limit: Option<u32>,
        offset: Option<u32>,
    ) -> Result<BridgeHistoryResponse> {
        let mut query = serde_json::Map::new();
        if let Some(l) = limit {
            query.insert("limit".into(), serde_json::json!(l));
        }
        if let Some(o) = offset {
            query.insert("offset".into(), serde_json::json!(o));
        }
        let q = if query.is_empty() {
            None
        } else {
            Some(serde_json::Value::Object(query))
        };
        self.http.get_auth("/bridge/history", q.as_ref()).await
    }

    pub fn bridge_stream(&self) -> Option<TinyVerseWebSocket> {
        self.ws_factory.as_ref().map(|f| f("/bridge/stream"))
    }
}
