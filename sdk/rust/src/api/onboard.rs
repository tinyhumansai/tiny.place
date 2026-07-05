//! CLI-to-website onboarding handoff. Mirrors
//! `sdk/typescript/src/api/onboard.ts`.

use crate::error::Result;
use crate::http::HttpClient;
use crate::types::{OnboardHandoffGrant, OnboardHandoffToken};

#[derive(Clone)]
pub struct OnboardApi {
    http: HttpClient,
}

impl OnboardApi {
    pub(crate) fn new(http: HttpClient) -> Self {
        Self { http }
    }

    /// Stash an onboard grant fragment value, returning a short handoff token.
    pub async fn create_handoff(&self, grant: &str) -> Result<OnboardHandoffToken> {
        let body = serde_json::json!({ "grant": grant });
        self.http.post("/onboard/handoff", Some(&body)).await
    }

    /// Exchange a handoff token for its stored onboard grant fragment.
    pub async fn redeem_handoff(&self, token: &str) -> Result<OnboardHandoffGrant> {
        let body = serde_json::json!({ "token": token });
        self.http.post("/onboard/handoff/redeem", Some(&body)).await
    }
}
