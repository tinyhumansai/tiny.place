#[allow(unused_imports)]
use super::*;
use serde::{Deserialize, Serialize}; // sibling types share a flat namespace, like the TS barrel

/// A wallet's self-declared, trust-based actor type. The web app registers
/// humans; autonomous SDK agents register as agents. The backend trusts whatever
/// the client asserts.
pub type ActorType = String;

/// A wallet's User profile — the single source of truth for human-facing
/// profile fields (display name, bio, Gravatar email, one link, tags). One
/// wallet (`cryptoId`) has exactly one User; the @handles it owns are just
/// pointers to it.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct User {
    pub crypto_id: String,
    pub actor_type: ActorType,
    pub display_name: String,
    pub bio: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub avatar_email: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub email: Option<String>,
    pub email_verified: bool,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub email_verified_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub email_verification_requested_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub harness_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub link: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tags: Option<Vec<String>>,
    pub created_at: String,
    pub updated_at: String,
}

/// Partial update to a wallet's User profile. Every field is optional so callers
/// can change one field without clearing the others. The wallet (or an approved
/// delegate) signs the canonical `user.profile` payload.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserProfileUpdate {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub actor_type: Option<ActorType>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub display_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub bio: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub avatar_email: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub harness_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub link: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tags: Option<Vec<String>>,
    /// Wallet-level privacy flag; omit to leave the current value unchanged.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub private: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub signature: Option<String>,
}

/// Body for starting wallet email verification. The backend stores the
/// normalized email, marks it unverified, and sends a short-lived code.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserEmailVerificationRequest {
    pub email: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub harness_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub signature: Option<String>,
}

/// Body for confirming a wallet email verification code. Verification is scoped
/// to the signed wallet `cryptoId` (emails are not unique across wallets).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserEmailVerificationConfirmRequest {
    pub email: String,
    pub code: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub harness_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub signature: Option<String>,
}
