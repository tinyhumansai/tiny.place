//! UsersApi reads and writes the per-wallet User profile — the single source of
//! truth for human-facing fields (display name, bio, avatar, links, tags). A
//! wallet is identified by its `cryptoId`; the @handles it owns are pointers to
//! it.

use crate::auth::sign_fresh_canonical_payload;
use crate::crypto::canonical_payload;
use crate::error::Result;
use crate::http::HttpClient;
use crate::types::{User, UserProfileUpdate};
use crate::util::encode;

#[derive(Clone)]
pub struct UsersApi {
    http: HttpClient,
}

impl UsersApi {
    pub(crate) fn new(http: HttpClient) -> Self {
        Self { http }
    }

    /// Fetch a wallet's profile by its cryptoId.
    pub async fn get(&self, crypto_id: &str) -> Result<User> {
        self.http
            .get(&format!("/users/{}", encode(crypto_id)), &[])
            .await
    }

    /// Update the signed-in wallet's profile. Signs the canonical `user.profile`
    /// payload and presents the signing key so the backend can authorize either
    /// the wallet itself or an approved hot session key (delegate).
    pub async fn update_profile(&self, crypto_id: &str, update: UserProfileUpdate) -> Result<User> {
        let mut update = update;
        if update.signature.is_none() {
            if let Some(signer) = self.http.signer() {
                let payload = user_profile_signature_payload(crypto_id, &update);
                update.signature =
                    Some(sign_fresh_canonical_payload(signer.as_ref(), &payload).await?);
            }
        }
        self.http
            .put_directory_auth(
                &format!("/users/{}/profile", encode(crypto_id)),
                Some(&update),
            )
            .await
    }
}

/// Builds the canonical `user.profile` payload signed for a profile update. The
/// field set and the undefined→null mapping must match the backend's
/// `userProfilePayload` exactly so the signature verifies (the backend derives
/// the same payload from the request body, where absent fields are null).
fn user_profile_signature_payload(crypto_id: &str, update: &UserProfileUpdate) -> String {
    fn or_null<T: Into<serde_json::Value> + Clone>(value: &Option<T>) -> serde_json::Value {
        match value {
            Some(v) => v.clone().into(),
            None => serde_json::Value::Null,
        }
    }
    fn arr_or_null(value: &Option<Vec<String>>) -> serde_json::Value {
        match value {
            Some(v) => serde_json::Value::Array(
                v.iter()
                    .map(|s| serde_json::Value::String(s.clone()))
                    .collect(),
            ),
            None => serde_json::Value::Null,
        }
    }
    canonical_payload(
        "user.profile",
        serde_json::json!({
            "actorType": or_null(&update.actor_type),
            "avatarEmail": or_null(&update.avatar_email),
            "bio": or_null(&update.bio),
            "cryptoId": crypto_id,
            "displayName": or_null(&update.display_name),
            "harnessKey": or_null(&update.harness_key),
            "link": or_null(&update.link),
            "tags": arr_or_null(&update.tags),
        }),
    )
}
