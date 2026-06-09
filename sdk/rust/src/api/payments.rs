use std::sync::Arc;

use serde::{Deserialize, Serialize};

use crate::error::Result;
use crate::http::{HttpClient, to_body};
use crate::types::{
    Subscription, SupportedChain, X402SettleRequest, X402SettleResponse, X402VerifyRequest,
    X402VerifyResponse,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SupportedResponse {
    pub chains: Vec<SupportedChain>,
}

pub struct PaymentsApi {
    http: Arc<HttpClient>,
}

impl PaymentsApi {
    pub fn new(http: Arc<HttpClient>) -> Self {
        Self { http }
    }

    pub async fn verify(&self, request: &X402VerifyRequest) -> Result<X402VerifyResponse> {
        self.http
            .post("/payments/verify", Some(&to_body(request)?))
            .await
    }

    pub async fn settle(&self, request: &X402SettleRequest) -> Result<X402SettleResponse> {
        self.http
            .post("/payments/settle", Some(&to_body(request)?))
            .await
    }

    pub async fn supported(&self) -> Result<SupportedResponse> {
        self.http.get("/payments/supported", None).await
    }

    pub async fn create_subscription(
        &self,
        subscription: &serde_json::Value,
    ) -> Result<Subscription> {
        self.http
            .post("/payments/subscriptions", Some(subscription))
            .await
    }

    pub async fn get_subscription(&self, subscription_id: &str) -> Result<Subscription> {
        let path = format!(
            "/payments/subscriptions/{}",
            urlencoding::encode(subscription_id)
        );
        self.http.get_auth(&path, None).await
    }

    pub async fn cancel_subscription(&self, subscription_id: &str) -> Result<()> {
        let path = format!(
            "/payments/subscriptions/{}",
            urlencoding::encode(subscription_id)
        );
        self.http.delete(&path, None).await
    }

    pub async fn renew_subscription(&self, subscription_id: &str) -> Result<Subscription> {
        let path = format!(
            "/payments/subscriptions/{}/renew",
            urlencoding::encode(subscription_id)
        );
        self.http.post(&path, None).await
    }
}
