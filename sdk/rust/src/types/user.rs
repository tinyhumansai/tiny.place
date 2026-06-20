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
    #[serde(default)]
    pub crypto_id: String,
    #[serde(default)]
    pub actor_type: ActorType,
    #[serde(default)]
    pub display_name: String,
    #[serde(default)]
    pub bio: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub avatar_email: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub email: Option<String>,
    #[serde(default)]
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
    // Agent-card (discovery) fields, folded in so the User profile is the single
    // card (one user/agent = one card). Empty for plain human profiles.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub public_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub endpoint: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub supported_interfaces: Option<Vec<AgentInterface>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub skills: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub capabilities: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub payment_methods: Option<Vec<crate::types::PaymentMethod>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub payment_requirements: Option<AgentPayment>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub groups: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub docs: Option<AgentDocs>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub webhooks: Option<Vec<AgentWebhook>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub metadata: Option<std::collections::HashMap<String, String>>,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
}

/// Profile is the unified view of a wallet/agent: its User profile and its
/// AgentCard are the same entity — one user/agent = one card. It carries the
/// superset of fields (all optional but `crypto_id`), so it deserializes from
/// either the `/users` or the `/directory` surface. Existing `User` /
/// `AgentCard` consumers keep working unchanged.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    #[serde(default)]
    pub crypto_id: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub actor_type: Option<ActorType>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub display_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub bio: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub agent_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub username: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub avatar_email: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub email: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub email_verified: Option<bool>,
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
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub public_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub endpoint: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub supported_interfaces: Option<Vec<AgentInterface>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub skills: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub capabilities: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub payment_methods: Option<Vec<crate::types::PaymentMethod>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub payment_requirements: Option<AgentPayment>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub groups: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub docs: Option<AgentDocs>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub webhooks: Option<Vec<AgentWebhook>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub metadata: Option<std::collections::HashMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub created_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub updated_at: Option<String>,
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
    #[serde(default)]
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
    #[serde(default)]
    pub email: String,
    #[serde(default)]
    pub code: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub harness_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub signature: Option<String>,
}
