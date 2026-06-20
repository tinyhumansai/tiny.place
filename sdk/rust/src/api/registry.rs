//! Identity registry API. Mirrors `sdk/typescript/src/api/registry.ts`.
//!
//! On-chain Solana registration helpers (`registerWithSolanaPayment` and
//! friends) are intentionally omitted from this Rust port; only the plain REST
//! methods are provided.

use serde::Serialize;

use crate::auth::sign_fresh_canonical_payload;
use crate::crypto::{canonical_payload, crypto_id_to_public_key_base64};
use crate::error::Result;
use crate::http::HttpClient;
use crate::types::{
    ActorType, AvailabilityResponse, Identity, IdentityClaimRequest, IdentityExport,
    IdentityTransferRequest, PaymentMethod, ProfileVisibility, ProfileVisibilityUpdate,
    RenewalRequest, Subname, SubnameCreateRequest,
};
use crate::util::encode;

/// Request body for registering a new name.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterRequest {
    pub username: String,
    pub crypto_id: String,
    /// Optional. A Solana `cryptoId` IS the base58 Ed25519 public key, so the
    /// SDK derives `publicKey` (base64) from `crypto_id` when omitted, matching
    /// the backend's server-side derivation. Supply it only to override; if
    /// supplied it must derive the same `cryptoId`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub public_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payment_methods: Option<Vec<PaymentMethod>>,
    /// The wallet's self-declared, trust-based actor type ("human"/"agent"),
    /// recorded on the wallet's User profile when it is first provisioned. Not
    /// part of the signed payload — the backend trusts the claim. Defaults to
    /// "agent".
    #[serde(skip_serializing_if = "Option::is_none")]
    pub actor_type: Option<ActorType>,
    /// Request that this name be assigned as the wallet's primary handle. When
    /// omitted, the backend still auto-assigns it as primary if the wallet has
    /// no primary yet (a wallet's first name is always its primary).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub primary: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payment: Option<std::collections::HashMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signature: Option<String>,
}

/// The identity registry: register, look up, and manage `@handle` names.
#[derive(Clone)]
pub struct RegistryApi {
    http: HttpClient,
}

impl RegistryApi {
    pub(crate) fn new(http: HttpClient) -> Self {
        Self { http }
    }

    /// Register a new name. When a signer is configured and the request is not
    /// already signed, signs a fresh `identity.register` canonical payload.
    pub async fn register(&self, mut request: RegisterRequest) -> Result<Identity> {
        request.username = normalize_handle(&request.username);

        // A Solana cryptoId IS the base58 ed25519 public key; derive the base64
        // publicKey the backend stores and signs over when the caller omits it,
        // so the signed payload and request body carry the identical value.
        if request.public_key.is_none() && !request.crypto_id.is_empty() {
            request.public_key = Some(crypto_id_to_public_key_base64(&request.crypto_id)?);
        }

        if request.signature.is_none() {
            if let Some(signer) = self.http.signer() {
                let payload = registration_signature_payload(&request);
                request.signature =
                    Some(sign_fresh_canonical_payload(signer.as_ref(), &payload).await?);
            }
        }

        self.http
            .post_public::<Identity, RegisterRequest>("/registry/names", Some(&request))
            .await
    }

    /// Look up a name's availability and (if taken) its identity.
    pub async fn get(&self, name: &str) -> Result<AvailabilityResponse> {
        self.http
            .get(&format!("/registry/names/{}", encode(name)), &[])
            .await
    }

    /// Export an identity and its ledger history.
    pub async fn export(&self, name: &str) -> Result<IdentityExport> {
        self.http
            .get(&format!("/registry/names/{}/export", encode(name)), &[])
            .await
    }

    /// Alias for [`export`]. Mirrors the TS SDK's `exportIdentity`.
    pub async fn export_identity(&self, name: &str) -> Result<IdentityExport> {
        self.export(name).await
    }

    /// Update a name's profile visibility flags.
    pub async fn update_profile_visibility(
        &self,
        name: &str,
        mut update: ProfileVisibilityUpdate,
    ) -> Result<ProfileVisibility> {
        if update.signature.is_none() {
            if let Some(signer) = self.http.signer() {
                let payload = canonical_payload(
                    "identity.profile.visibility",
                    serde_json::json!({
                        "activity": update.activity,
                        "agentCard": update.agent_card,
                        "attestations": update.attestations,
                        "broadcasts": update.broadcasts,
                        "groups": update.groups,
                        "searchEngineIndexing": update.search_engine_indexing,
                        "username": name,
                    }),
                );
                update.signature =
                    Some(sign_fresh_canonical_payload(signer.as_ref(), &payload).await?);
            }
        }
        self.http
            .put_directory_auth::<ProfileVisibility, ProfileVisibilityUpdate>(
                &format!("/registry/names/{}/profile-visibility", encode(name)),
                Some(&update),
            )
            .await
    }

    /// Renew a name for another registration period.
    pub async fn renew(&self, name: &str, mut request: RenewalRequest) -> Result<Identity> {
        if request.signature.is_none() {
            if let Some(signer) = self.http.signer() {
                let payload =
                    canonical_payload("identity.renew", serde_json::json!({ "username": name }));
                request.signature =
                    Some(sign_fresh_canonical_payload(signer.as_ref(), &payload).await?);
            }
        }
        self.http
            .post_directory_auth::<Identity, RenewalRequest>(
                &format!("/registry/names/{}/renew", encode(name)),
                Some(&request),
            )
            .await
    }

    /// Directly transfer this name to another wallet with no payment (a gift or
    /// account move), distinct from the paid marketplace flow. The CURRENT owner
    /// (this client's signing key, or an approved delegate) authorizes the move;
    /// `request.crypto_id`/`request.public_key` identify the recipient. The name
    /// keeps its registration period and the recipient receives it unassigned.
    pub async fn transfer(
        &self,
        name: &str,
        mut request: IdentityTransferRequest,
    ) -> Result<Identity> {
        if request.signature.is_none() {
            if let Some(signer) = self.http.signer() {
                let payload = canonical_payload(
                    "identity.transfer",
                    serde_json::json!({
                        "cryptoId": request.crypto_id,
                        "publicKey": request.public_key,
                        "username": name,
                    }),
                );
                request.signature =
                    Some(sign_fresh_canonical_payload(signer.as_ref(), &payload).await?);
            }
        }
        self.http
            .post_directory_auth::<Identity, IdentityTransferRequest>(
                &format!("/registry/names/{}/transfer", encode(name)),
                Some(&request),
            )
            .await
    }

    /// Assign this name as the owner wallet's primary handle. Clears the primary
    /// flag on the wallet's other names (one primary per wallet) and locks this
    /// name from sale until it is unassigned.
    pub async fn assign_primary(&self, name: &str) -> Result<Identity> {
        self.set_primary(name, true).await
    }

    /// Unassign this name as primary, leaving it unassigned and therefore
    /// sellable.
    pub async fn unassign_primary(&self, name: &str) -> Result<Identity> {
        self.set_primary(name, false).await
    }

    async fn set_primary(&self, name: &str, primary: bool) -> Result<Identity> {
        let action = if primary {
            "identity.assign"
        } else {
            "identity.unassign"
        };
        let mut body = SignatureBody { signature: None };
        if let Some(signer) = self.http.signer() {
            let payload = canonical_payload(action, serde_json::json!({ "username": name }));
            body.signature = Some(sign_fresh_canonical_payload(signer.as_ref(), &payload).await?);
        }
        let segment = if primary { "assign" } else { "unassign" };
        self.http
            .post_directory_auth::<Identity, SignatureBody>(
                &format!("/registry/names/{}/{}", encode(name), segment),
                Some(&body),
            )
            .await
    }

    /// Claim a name onto a wallet.
    pub async fn claim(&self, name: &str, mut request: IdentityClaimRequest) -> Result<Identity> {
        if request.signature.is_none() {
            if let Some(signer) = self.http.signer() {
                let payload = canonical_payload(
                    "identity.claim",
                    serde_json::json!({
                        "cryptoId": request.crypto_id,
                        "publicKey": request.public_key,
                        "username": name,
                    }),
                );
                request.signature =
                    Some(sign_fresh_canonical_payload(signer.as_ref(), &payload).await?);
            }
        }
        self.http
            .post::<Identity, IdentityClaimRequest>(
                &format!("/registry/names/{}/claim", encode(name)),
                Some(&request),
            )
            .await
    }

    /// Create a subname under this name.
    pub async fn create_subname(
        &self,
        name: &str,
        mut request: SubnameCreateRequest,
    ) -> Result<Subname> {
        if request.signature.is_none() {
            if let Some(signer) = self.http.signer() {
                let payload = canonical_payload(
                    "identity.subname.create",
                    serde_json::json!({
                        "bio": request.bio,
                        "subname": request.subname,
                        "target": request.target,
                        "username": name,
                    }),
                );
                request.signature =
                    Some(sign_fresh_canonical_payload(signer.as_ref(), &payload).await?);
            }
        }
        self.http
            .post_directory_auth::<Subname, SubnameCreateRequest>(
                &format!("/registry/names/{}/subnames", encode(name)),
                Some(&request),
            )
            .await
    }

    /// Delete a subname under this name.
    pub async fn delete_subname(&self, name: &str, subname: &str) -> Result<Identity> {
        let mut headers: crate::auth::Headers = Vec::new();
        if let Some(signer) = self.http.signer() {
            let payload = canonical_payload(
                "identity.subname.delete",
                serde_json::json!({
                    "subname": subname,
                    "username": name,
                }),
            );
            let signature = sign_fresh_canonical_payload(signer.as_ref(), &payload).await?;
            headers.push(("X-TinyPlace-Signature".to_string(), signature));
            // Present the signing key so the backend can authorize a delegated
            // hot session key (the X-TinyPlace-Signature above is the ownership
            // proof).
            if let Some(presented_key) = self.http.signing_public_key() {
                headers.push(("X-TinyPlace-Public-Key".to_string(), presented_key));
            }
        }
        self.http
            .delete_public::<Identity, serde_json::Value>(
                &format!(
                    "/registry/names/{}/subnames/{}",
                    encode(name),
                    encode(subname)
                ),
                None,
                &headers,
            )
            .await
    }
}

/// A request body carrying only an optional signature.
#[derive(Debug, Clone, Serialize)]
struct SignatureBody {
    #[serde(skip_serializing_if = "Option::is_none")]
    signature: Option<String>,
}

/// Normalize a handle to its `@`-prefixed form.
fn normalize_handle(name: &str) -> String {
    let trimmed = name.trim();
    if trimmed.starts_with('@') {
        trimmed.to_string()
    } else {
        format!("@{trimmed}")
    }
}

/// Build the canonical `identity.register` payload string that is signed.
///
/// A handle is just a pointer now: registration binds the cryptoId to the
/// public key. Profile fields (bio/name/metadata) live on the wallet's User and
/// are set separately via UsersApi. `primary` is intentionally NOT signed — it
/// only affects the owner's own names, so the backend reads it from the request
/// without binding it.
fn registration_signature_payload(request: &RegisterRequest) -> String {
    // Built by hand to reproduce the TS `JSON.stringify` byte sequence exactly:
    // insertion order is significant (the payload is signed) and serde_json's
    // default `Map` sorts keys, which would reorder the nested payment-method
    // objects (`network, address, assets`).
    let payment_methods = match &request.payment_methods {
        Some(methods) => {
            let entries: Vec<String> = methods.iter().map(payment_method_payload).collect();
            format!("[{}]", entries.join(","))
        }
        None => "null".to_string(),
    };
    format!(
        "{{\"action\":\"identity.register\",\"fields\":{{\"cryptoId\":{},\"paymentMethods\":{},\"publicKey\":{},\"username\":{}}}}}",
        json_string(&request.crypto_id),
        payment_methods,
        json_string(request.public_key.as_deref().unwrap_or("")),
        json_string(&request.username),
    )
}

fn payment_method_payload(method: &PaymentMethod) -> String {
    let assets: Vec<String> = method.assets.iter().map(|a| json_string(a)).collect();
    format!(
        "{{\"network\":{},\"address\":{},\"assets\":[{}]}}",
        json_string(&method.network),
        json_string(&method.address),
        assets.join(","),
    )
}

fn json_string(value: &str) -> String {
    serde_json::to_string(value).expect("string serialization cannot fail")
}
