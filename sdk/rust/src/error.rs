use thiserror::Error;

#[derive(Debug, Error)]
pub enum TinyVerseError {
    #[error("HTTP {status}: {body}")]
    Http { status: u16, body: String },

    #[error("WebSocket error: {0}")]
    WebSocket(String),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("Request error: {0}")]
    Request(#[from] reqwest::Error),

    #[error("Signing error: {0}")]
    Signing(String),
}

pub type Result<T> = std::result::Result<T, TinyVerseError>;
