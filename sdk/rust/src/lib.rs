pub mod error;
pub mod auth;
pub mod http;
pub mod websocket;
pub mod client;
pub mod types;
pub mod api;

pub use error::{TinyVerseError, Result};
pub use auth::{SigningKey, build_auth_header, sign_request};
pub use http::HttpClient;
pub use websocket::{TinyVerseWebSocket, TinyVerseWebSocketOptions, WebSocketEvent};
pub use client::{TinyVerseClient, TinyVerseClientConfig};

pub const SDK_VERSION: &str = "0.1.0";
