//! Pricing. Mirrors `sdk/typescript/src/api/pricing.ts`.

use serde::Deserialize;

use crate::error::Result;
use crate::http::HttpClient;
use crate::types::{GasEstimate, PriceHistory, PriceQuote, SupportedChain, TradePair};

#[derive(Debug, Clone, Deserialize)]
pub struct PriceAsset {
    pub symbol: String,
    #[serde(default)]
    pub address: Option<String>,
    pub decimals: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PriceAssets {
    pub assets: Vec<PriceAsset>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TradePairs {
    pub pairs: Vec<TradePair>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SupportedNetworks {
    pub networks: Vec<SupportedChain>,
}

/// Params for [`PricingApi::quote`].
#[derive(Debug, Clone, Default)]
pub struct QuoteParams {
    pub base: String,
    pub quote: String,
    pub network: Option<String>,
}

/// Params for [`PricingApi::history`].
#[derive(Debug, Clone, Default)]
pub struct HistoryParams {
    pub base: String,
    pub quote: String,
    pub interval: String,
    pub from: Option<String>,
    pub to: Option<String>,
}

/// Pricing API.
#[derive(Clone)]
pub struct PricingApi {
    http: HttpClient,
}

fn push_opt(query: &mut Vec<(String, String)>, key: &str, value: &Option<String>) {
    if let Some(value) = value {
        query.push((key.to_string(), value.clone()));
    }
}

impl PricingApi {
    pub(crate) fn new(http: HttpClient) -> Self {
        Self { http }
    }

    // --- Price Data ---

    /// Fetch a price quote for a trading pair.
    pub async fn quote(&self, params: &QuoteParams) -> Result<PriceQuote> {
        let mut query = vec![
            ("base".to_string(), params.base.clone()),
            ("quote".to_string(), params.quote.clone()),
        ];
        push_opt(&mut query, "network", &params.network);
        self.http.get("/pricing/quote", &query).await
    }

    /// Fetch historical candles for a trading pair.
    pub async fn history(&self, params: &HistoryParams) -> Result<PriceHistory> {
        let mut query = vec![
            ("base".to_string(), params.base.clone()),
            ("quote".to_string(), params.quote.clone()),
            ("interval".to_string(), params.interval.clone()),
        ];
        push_opt(&mut query, "from", &params.from);
        push_opt(&mut query, "to", &params.to);
        self.http.get("/pricing/history", &query).await
    }

    /// List supported pricing assets.
    pub async fn assets(&self) -> Result<PriceAssets> {
        self.http.get("/pricing/assets", &[]).await
    }

    /// List supported trading pairs.
    pub async fn pairs(&self) -> Result<TradePairs> {
        self.http.get("/pricing/pairs", &[]).await
    }

    /// List supported networks.
    pub async fn networks(&self) -> Result<SupportedNetworks> {
        self.http.get("/pricing/networks", &[]).await
    }

    /// Fetch a gas estimate for `network`.
    pub async fn gas(&self, network: &str) -> Result<GasEstimate> {
        let query = vec![("network".to_string(), network.to_string())];
        self.http.get("/pricing/gas", &query).await
    }
}
