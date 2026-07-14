use serde::{Deserialize, Serialize};

#[allow(unused_imports)]
use super::*;

/// Response of `POST /onboard/handoff`: a short token standing in for a grant.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OnboardHandoffToken {
    pub token: String,
    pub expires_at: String,
}

/// Response of `POST /onboard/handoff/redeem`: the stored grant fragment.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OnboardHandoffGrant {
    pub grant: String,
    pub wallet: String,
    pub scope: Vec<String>,
    pub expires_at: String,
}
