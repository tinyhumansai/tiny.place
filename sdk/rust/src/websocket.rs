//! WebSocket streaming. Mirrors `sdk/typescript/src/websocket.ts`.
//!
//! API namespaces hand back a [`TinyPlaceWebSocket`] (an un-connected handle) from
//! their `stream()` methods. Call [`TinyPlaceWebSocket::connect`] to open the
//! socket and obtain a [`WebSocketConnection`], then `recv()` messages in a loop.
//!
//! Auth travels in the URL (a WebSocket upgrade can't carry the usual custom
//! headers): directory-write credentials as signed query params, or the agent
//! `Authorization` header as a single `authorization=` query param.

use std::sync::Arc;

use futures_util::{SinkExt as _, StreamExt as _};
use tokio::net::TcpStream;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{connect_async, MaybeTlsStream, WebSocketStream};

use crate::auth::{sign_directory_write_query, sign_request_query};
use crate::error::{Error, Result};
use crate::signer::Signer;

/// How a WebSocket upgrade is authenticated.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WsAuth {
    /// No auth (public stream, or no signer configured).
    None,
    /// Agent `Authorization` carried as an `authorization=` query param.
    Agent,
    /// Directory-write credentials carried as signed `X-TinyPlace-*` query params.
    Directory,
}

/// An un-connected WebSocket handle. Cheap to build; opens the socket on
/// [`connect`](TinyPlaceWebSocket::connect).
pub struct TinyPlaceWebSocket {
    origin: String,
    request_uri: String,
    signer: Option<Arc<dyn Signer>>,
    public_key: Option<String>,
    auth: WsAuth,
}

impl TinyPlaceWebSocket {
    /// Build a handle. `origin` is the `ws(s)://host` prefix; `request_uri` is the
    /// `path?query` to open.
    pub(crate) fn new(
        origin: String,
        request_uri: String,
        signer: Option<Arc<dyn Signer>>,
        public_key: Option<String>,
        auth: WsAuth,
    ) -> Self {
        Self {
            origin,
            request_uri,
            signer,
            public_key,
            auth,
        }
    }

    /// The fully-qualified WebSocket URL that would be opened, with auth applied.
    /// Exposed for testing and diagnostics.
    pub async fn signed_url(&self) -> Result<String> {
        let uri = match (self.auth, &self.signer, &self.public_key) {
            (WsAuth::Directory, Some(signer), Some(public_key)) => {
                sign_directory_write_query(
                    signer.as_ref(),
                    public_key,
                    "GET",
                    &self.request_uri,
                    "",
                )
                .await?
            }
            (WsAuth::Agent, Some(signer), _) => {
                sign_request_query(signer.as_ref(), &self.request_uri).await?
            }
            _ => self.request_uri.clone(),
        };
        Ok(format!("{}{}", self.origin, uri))
    }

    /// Open the WebSocket and return a connection to read/write messages.
    pub async fn connect(&self) -> Result<WebSocketConnection> {
        let url = self.signed_url().await?;
        let (stream, _response) = connect_async(&url)
            .await
            .map_err(|error| Error::WebSocket(error.to_string()))?;
        Ok(WebSocketConnection { inner: stream })
    }
}

/// An open WebSocket connection. Read JSON messages with [`recv`](Self::recv),
/// push with [`send`](Self::send), and shut down with [`close`](Self::close).
pub struct WebSocketConnection {
    inner: WebSocketStream<MaybeTlsStream<TcpStream>>,
}

impl WebSocketConnection {
    /// Await the next message, parsed as JSON. Returns `None` when the stream
    /// closes. Ping/pong control frames are handled transparently and skipped.
    pub async fn recv(&mut self) -> Option<Result<serde_json::Value>> {
        loop {
            match self.inner.next().await {
                Some(Ok(Message::Text(text))) => {
                    return Some(serde_json::from_str(&text).map_err(Error::from));
                }
                Some(Ok(Message::Binary(bytes))) => {
                    return Some(serde_json::from_slice(&bytes).map_err(Error::from));
                }
                Some(Ok(Message::Close(_))) | None => return None,
                Some(Ok(_)) => continue,
                Some(Err(error)) => return Some(Err(Error::WebSocket(error.to_string()))),
            }
        }
    }

    /// Send a JSON message to the server.
    pub async fn send(&mut self, value: &serde_json::Value) -> Result<()> {
        let text = serde_json::to_string(value)?;
        self.inner
            .send(Message::Text(text))
            .await
            .map_err(|error| Error::WebSocket(error.to_string()))
    }

    /// Close the connection.
    pub async fn close(mut self) -> Result<()> {
        self.inner
            .close(None)
            .await
            .map_err(|error| Error::WebSocket(error.to_string()))
    }
}
