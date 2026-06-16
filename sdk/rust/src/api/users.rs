//! UsersApi reads and writes the per-wallet User profile — the single source of
//! truth for human-facing fields (display name, bio, Gravatar email, one link,
//! tags). A wallet is identified by its `cryptoId`; the @handles it owns are
//! pointers to it.

use crate::auth::sign_fresh_canonical_payload;
use crate::crypto::canonical_payload;
use crate::error::Result;
use crate::http::HttpClient;
use crate::types::{
    User, UserEmailVerificationConfirmRequest, UserEmailVerificationRequest, UserProfileUpdate,
};
use crate::util::encode;

#[derive(Clone)]
pub struct UsersApi {
    http: HttpClient,
    /// Default harness key merged into profile/email requests that omit one.
    harness_key: Option<String>,
}

impl UsersApi {
    pub(crate) fn new(http: HttpClient, harness_key: Option<String>) -> Self {
        Self { http, harness_key }
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
        if update.harness_key.is_none() {
            update.harness_key = self.harness_key.clone();
        }
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

    /// Start email verification for a wallet. The backend stores the normalized
    /// email on the wallet profile, marks it unverified, and sends a short-lived
    /// code through the configured email provider.
    pub async fn start_email_verification(
        &self,
        crypto_id: &str,
        request: UserEmailVerificationRequest,
    ) -> Result<User> {
        let mut request = request;
        if request.harness_key.is_none() {
            request.harness_key = self.harness_key.clone();
        }
        if request.signature.is_none() {
            if let Some(signer) = self.http.signer() {
                let payload = user_email_start_signature_payload(crypto_id, &request);
                request.signature =
                    Some(sign_fresh_canonical_payload(signer.as_ref(), &payload).await?);
            }
        }
        self.http
            .post_directory_auth(
                &format!("/users/{}/email/verification", encode(crypto_id)),
                Some(&request),
            )
            .await
    }

    /// Confirm a wallet email verification code. Emails are not unique across
    /// wallets; verification is scoped to the signed wallet cryptoId.
    pub async fn confirm_email_verification(
        &self,
        crypto_id: &str,
        request: UserEmailVerificationConfirmRequest,
    ) -> Result<User> {
        let mut request = request;
        if request.harness_key.is_none() {
            request.harness_key = self.harness_key.clone();
        }
        if request.signature.is_none() {
            if let Some(signer) = self.http.signer() {
                let payload = user_email_confirm_signature_payload(crypto_id, &request);
                request.signature =
                    Some(sign_fresh_canonical_payload(signer.as_ref(), &payload).await?);
            }
        }
        self.http
            .post_directory_auth(
                &format!("/users/{}/email/verification/confirm", encode(crypto_id)),
                Some(&request),
            )
            .await
    }
}

/// Builds the canonical `user.profile` payload signed for a profile update. The
/// field set and the absent→null mapping must match the backend's
/// `userProfilePayload` exactly so the signature verifies (the backend derives
/// the same payload from the request body, where absent fields are null).
fn user_profile_signature_payload(crypto_id: &str, update: &UserProfileUpdate) -> String {
    fn or_null(value: &Option<String>) -> serde_json::Value {
        match value {
            Some(v) => serde_json::Value::String(v.clone()),
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

fn user_email_start_signature_payload(
    crypto_id: &str,
    request: &UserEmailVerificationRequest,
) -> String {
    let harness_key = request
        .harness_key
        .clone()
        .map(serde_json::Value::String)
        .unwrap_or(serde_json::Value::Null);
    canonical_payload(
        "user.email.start",
        serde_json::json!({
            "cryptoId": crypto_id,
            "email": request.email,
            "harnessKey": harness_key,
        }),
    )
}

fn user_email_confirm_signature_payload(
    crypto_id: &str,
    request: &UserEmailVerificationConfirmRequest,
) -> String {
    let harness_key = request
        .harness_key
        .clone()
        .map(serde_json::Value::String)
        .unwrap_or(serde_json::Value::Null);
    canonical_payload(
        "user.email.confirm",
        serde_json::json!({
            "code": request.code,
            "cryptoId": crypto_id,
            "email": request.email,
            "harnessKey": harness_key,
        }),
    )
}
