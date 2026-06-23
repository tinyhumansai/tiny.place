//! Payment facilitator: x402 verify/settle, subscriptions. Mirrors
//! `sdk/typescript/src/api/payments.ts` (REST surface only).
//!
//! On-chain Solana settlement execution (`settleWithSolanaPayment` and the
//! `executeSolanaX402Payment` path) is intentionally NOT ported — the Rust SDK
//! has no Solana transaction support.

use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::error::Result;
use crate::http::HttpClient;
use crate::types::{
    DueRenewalResult, Subscription, SubscriptionCreateRequest, SubscriptionRenewRequest,
    SubscriptionRenewResponse, SupportedChain, X402SettleRequest, X402SettleResponse,
    X402VerifyRequest, X402VerifyResponse, X402VerifyUntilValidOptions,
};
use crate::util::encode;

const DEFAULT_VERIFY_ATTEMPTS: i64 = 10;
const DEFAULT_VERIFY_INTERVAL_MS: i64 = 2000;
const DEFAULT_RETRY_ERRORS: &[&str] = &["transaction not found", "insufficient confirmations"];

#[derive(Serialize)]
struct VerifyBody<'a> {
    payment: &'a X402VerifyRequest,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SettleBody<'a> {
    payment: &'a X402VerifyRequest,
    #[serde(skip_serializing_if = "Option::is_none")]
    settled_amount: &'a Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    fee_quote_id: &'a Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    reference: &'a Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    shielded: &'a Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FacilitatorAccount {
    pub address: String,
    pub network: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SupportedChains {
    pub chains: Vec<SupportedChain>,
}

/// Optional params for [`PaymentsApi::renew_due_subscriptions`].
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenewDueParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<i64>,
}

fn should_retry_verify(response: &X402VerifyResponse, retry_errors: &[String]) -> bool {
    if response.valid || response.error.is_none() {
        return false;
    }
    let error = response.error.as_deref().unwrap_or_default().to_lowercase();
    retry_errors
        .iter()
        .any(|retry_error| error.contains(&retry_error.to_lowercase()))
}

/// Payment facilitator API.
#[derive(Clone)]
pub struct PaymentsApi {
    http: HttpClient,
}

impl PaymentsApi {
    pub(crate) fn new(http: HttpClient) -> Self {
        Self { http }
    }

    /// Verify an x402 payment authorization.
    pub async fn verify(&self, request: &X402VerifyRequest) -> Result<X402VerifyResponse> {
        let body = VerifyBody { payment: request };
        self.http.post("/payments/verify", Some(&body)).await
    }

    /// Poll [`verify`](Self::verify) until it succeeds or attempts are exhausted.
    pub async fn verify_until_valid(
        &self,
        request: &X402VerifyRequest,
        options: &X402VerifyUntilValidOptions,
    ) -> Result<X402VerifyResponse> {
        let attempts = options.attempts.unwrap_or(DEFAULT_VERIFY_ATTEMPTS);
        let interval_ms = options.interval_ms.unwrap_or(DEFAULT_VERIFY_INTERVAL_MS);
        let retry_errors: Vec<String> = options
            .retry_errors
            .clone()
            .unwrap_or_else(|| DEFAULT_RETRY_ERRORS.iter().map(|s| s.to_string()).collect());

        let mut response = self.verify(request).await?;
        let mut attempt = 1;
        while attempt < attempts {
            if !should_retry_verify(&response, &retry_errors) {
                return Ok(response);
            }
            if interval_ms > 0 {
                tokio::time::sleep(Duration::from_millis(interval_ms as u64)).await;
            }
            response = self.verify(request).await?;
            attempt += 1;
        }
        Ok(response)
    }

    /// Settle a verified x402 payment.
    pub async fn settle(&self, request: &X402SettleRequest) -> Result<X402SettleResponse> {
        let body = SettleBody {
            payment: &request.payment,
            settled_amount: &request.settled_amount,
            fee_quote_id: &request.fee_quote_id,
            reference: &request.reference,
            shielded: &request.shielded,
        };
        self.http.post("/payments/settle", Some(&body)).await
    }

    /// Fetch the facilitator's base58 account, which the client must set as the
    /// fee payer when building the on-chain transfer it signs.
    pub async fn facilitator(&self) -> Result<FacilitatorAccount> {
        self.http.get("/payments/facilitator", &[]).await
    }

    /// List the supported settlement chains.
    pub async fn supported(&self) -> Result<SupportedChains> {
        self.http.get("/payments/supported", &[]).await
    }

    /// Create a new subscription.
    pub async fn create_subscription(
        &self,
        subscription: &SubscriptionCreateRequest,
    ) -> Result<Subscription> {
        self.http
            .post("/payments/subscriptions", Some(subscription))
            .await
    }

    /// Fetch a subscription, optionally acting on behalf of `actor`.
    pub async fn get_subscription(
        &self,
        subscription_id: &str,
        actor: Option<&str>,
    ) -> Result<Subscription> {
        let path = format!("/payments/subscriptions/{}", encode(subscription_id));
        match actor {
            Some(actor) => self.http.get_directory_auth_as(&path, actor, &[]).await,
            None => self.http.get_agent_auth(&path, &[]).await,
        }
    }

    /// Cancel a subscription, optionally acting on behalf of `actor`.
    pub async fn cancel_subscription(
        &self,
        subscription_id: &str,
        actor: Option<&str>,
    ) -> Result<()> {
        let path = format!("/payments/subscriptions/{}", encode(subscription_id));
        match actor {
            Some(actor) => {
                self.http
                    .delete_directory_auth_as::<(), serde_json::Value>(&path, actor, None)
                    .await
            }
            None => {
                self.http
                    .delete_agent_auth::<(), serde_json::Value>(&path, None)
                    .await
            }
        }
    }

    /// Renew a subscription with a fresh payment authorization.
    pub async fn renew_subscription(
        &self,
        subscription_id: &str,
        request: &SubscriptionRenewRequest,
    ) -> Result<SubscriptionRenewResponse> {
        let path = format!("/payments/subscriptions/{}/renew", encode(subscription_id));
        self.http.post(&path, Some(request)).await
    }

    /// Admin: renew all due subscriptions. Pass `None` to omit the body
    /// (matching the TS SDK's optional `params`).
    pub async fn renew_due_subscriptions(
        &self,
        params: Option<&RenewDueParams>,
    ) -> Result<DueRenewalResult> {
        self.http
            .post_admin("/payments/subscriptions/renew-due", params)
            .await
    }
}
