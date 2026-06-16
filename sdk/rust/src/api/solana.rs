//! Public Solana chain info and JSON-RPC proxy (`/solana`, `/solana/rpc`).
//! Mirrors `sdk/typescript/src/api/solana.ts`.
//!
//! This is a thin REST proxy to the backend's Solana endpoint; it does **not**
//! build or submit on-chain transactions (those helpers are intentionally
//! omitted from the Rust port).

use serde::de::DeserializeOwned;

use crate::error::{Error, Result};
use crate::http::HttpClient;
use crate::types::{
    SolanaChainInfo, SolanaRpcBatchResponse, SolanaRpcId, SolanaRpcRequest, SolanaRpcResponse,
};

#[derive(Clone)]
pub struct SolanaApi {
    http: HttpClient,
}

impl SolanaApi {
    pub(crate) fn new(http: HttpClient) -> Self {
        Self { http }
    }

    /// Public chain metadata for the configured Solana network.
    pub async fn info(&self) -> Result<SolanaChainInfo> {
        self.http.get("/solana", &[]).await
    }

    /// Send a single JSON-RPC request through the backend's Solana proxy.
    pub async fn rpc<T: DeserializeOwned>(
        &self,
        request: &SolanaRpcRequest,
    ) -> Result<SolanaRpcResponse<T>> {
        self.http.post_public("/solana/rpc", Some(request)).await
    }

    /// Send a batch of JSON-RPC requests through the backend's Solana proxy.
    pub async fn rpc_batch<T: DeserializeOwned>(
        &self,
        requests: &[SolanaRpcRequest],
    ) -> Result<SolanaRpcBatchResponse<T>> {
        self.http
            .post_public("/solana/rpc", Some(&requests.to_vec()))
            .await
    }

    /// Convenience wrapper: send a single JSON-RPC call and unwrap its `result`,
    /// surfacing any JSON-RPC error as [`Error::Rpc`]. `id` defaults to `method`.
    pub async fn call<T: DeserializeOwned>(
        &self,
        method: &str,
        params: Option<serde_json::Value>,
        id: Option<SolanaRpcId>,
    ) -> Result<T> {
        let request = SolanaRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: Some(id.unwrap_or_else(|| serde_json::Value::String(method.to_string()))),
            method: method.to_string(),
            params,
        };
        let response: SolanaRpcResponse<T> = self.rpc(&request).await?;
        if let Some(error) = response.error {
            return Err(Error::Rpc(format!(
                "Solana JSON-RPC {}: {}",
                error.code, error.message
            )));
        }
        response
            .result
            .ok_or_else(|| Error::Rpc("Solana JSON-RPC response missing result".to_string()))
    }
}
