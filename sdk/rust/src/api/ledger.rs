use std::sync::Arc;

use serde::{Deserialize, Serialize};

use crate::error::Result;
use crate::http::{HttpClient, to_body, to_query};
use crate::types::{LedgerListParams, LedgerTransaction, LedgerVerifyRequest, LedgerVerifyResult};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LedgerListResponse {
    pub transactions: Vec<LedgerTransaction>,
}

pub struct LedgerApi {
    http: Arc<HttpClient>,
}

impl LedgerApi {
    pub fn new(http: Arc<HttpClient>) -> Self {
        Self { http }
    }

    pub async fn list(&self, params: Option<&LedgerListParams>) -> Result<LedgerListResponse> {
        let query = params.map(to_query).transpose()?;
        self.http.get("/ledger/transactions", query.as_ref()).await
    }

    pub async fn get(&self, tx_id: &str) -> Result<LedgerTransaction> {
        let path = format!("/ledger/transactions/{}", urlencoding::encode(tx_id));
        self.http.get(&path, None).await
    }

    pub async fn verify(&self, request: &LedgerVerifyRequest) -> Result<LedgerVerifyResult> {
        self.http
            .post_public("/ledger/verify", Some(&to_body(request)?))
            .await
    }
}
