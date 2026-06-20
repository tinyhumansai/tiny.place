use std::collections::HashMap;

use serde::{Deserialize, Serialize};

/// Errors returned by the SDK.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    /// A non-2xx HTTP response from the backend. Boxed to keep [`Error`] small.
    #[error("HTTP {}: {}", .0.status, .0.message)]
    Http(Box<HttpError>),

    /// The transport (reqwest) failed before a response was received.
    #[error("transport error: {0}")]
    Transport(#[from] reqwest::Error),

    /// (De)serialization failed.
    #[error("serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    /// A signing operation failed.
    #[error("signing error: {0}")]
    Signing(String),

    /// Invalid input supplied by the caller.
    #[error("invalid argument: {0}")]
    InvalidArgument(String),

    /// A WebSocket connection or protocol error.
    #[error("websocket error: {0}")]
    WebSocket(String),

    /// A JSON-RPC endpoint (e.g. the Solana proxy) returned an error object or
    /// an unexpected response shape.
    #[error("rpc error: {0}")]
    Rpc(String),
}

/// Details of a non-2xx HTTP response.
#[derive(Debug)]
pub struct HttpError {
    /// HTTP status code.
    pub status: u16,
    /// Human-readable message (`HTTP <status>: <path>`).
    pub message: String,
    /// Parsed response body (JSON value, or a string for non-JSON bodies).
    pub body: serde_json::Value,
    /// Response headers, lower-cased.
    pub headers: HashMap<String, String>,
    /// Decoded `X-Payment-Required` / body payment challenge, if present.
    pub payment_required: Option<PaymentRequiredChallenge>,
}

impl Error {
    /// The HTTP status code, if this is an [`Error::Http`].
    pub fn status(&self) -> Option<u16> {
        match self {
            Error::Http(err) => Some(err.status),
            _ => None,
        }
    }

    /// The parsed response body, if this is an [`Error::Http`].
    pub fn body(&self) -> Option<&serde_json::Value> {
        match self {
            Error::Http(err) => Some(&err.body),
            _ => None,
        }
    }

    /// The full HTTP error details, if this is an [`Error::Http`].
    pub fn http(&self) -> Option<&HttpError> {
        match self {
            Error::Http(err) => Some(err),
            _ => None,
        }
    }

    /// The x402 payment challenge, if the backend returned one.
    pub fn payment_required(&self) -> Option<&PaymentRequiredChallenge> {
        match self {
            Error::Http(err) => err.payment_required.as_ref(),
            _ => None,
        }
    }
}

/// Convenience alias for results returned by the SDK.
pub type Result<T> = std::result::Result<T, Error>;

/// An x402 payment-required challenge, surfaced on a `402` response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaymentRequiredChallenge {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub error: Option<String>,
    #[serde(default)]
    pub payment: PaymentChallenge,
}

/// The payment terms inside a [`PaymentRequiredChallenge`].
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PaymentChallenge {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scheme: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub network: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub asset: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub amount: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub to: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub nonce: Option<String>,
    #[serde(rename = "expiresAt", skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signature: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<HashMap<String, String>>,
}
