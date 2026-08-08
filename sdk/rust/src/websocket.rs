//! WebSocket streaming. Mirrors `sdk/typescript/src/websocket.ts`.
//!
//! API namespaces hand back a [`TinyPlaceWebSocket`] (an un-connected handle) from
//! their `stream()` methods. Call [`TinyPlaceWebSocket::connect`] to open the
//! socket and obtain a [`WebSocketConnection`], then `recv()` messages in a loop.
//!
//! Auth travels on the upgrade request as `X-TinyPlace-*` headers — the same
//! credential the REST routes carry, verified by the backend's auth middleware
//! before the socket is upgraded (see [`sign_websocket_upgrade`]). The legacy
//! URL-borne credentials (directory-write query params, or the agent
//! `Authorization` as an `authorization=` param) are still appended, so the same
//! handle authenticates against backends that only read the query string.
//!
//! A dropped stream is re-established transparently by [`WebSocketConnection::recv`]
//! under a [`ReconnectPolicy`], whose defaults match the TypeScript SDK's
//! `reconnect` / `reconnectInterval` / `maxReconnectAttempts` options. Each
//! attempt re-runs the full dial, so the upgrade carries a **freshly signed**
//! credential — replaying the original request would present a stale
//! timestamp/nonce and be rejected with a 401.

use std::sync::Arc;
use std::time::Duration;

use futures_util::{SinkExt as _, StreamExt as _};
use tokio::net::TcpStream;
use tokio_tungstenite::tungstenite::client::IntoClientRequest as _;
use tokio_tungstenite::tungstenite::http::{HeaderName, HeaderValue};
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{connect_async, MaybeTlsStream, WebSocketStream};

use crate::auth::{
    sign_directory_write_query, sign_request_query, sign_websocket_upgrade, Headers,
};
use crate::error::{Error, Result};
use crate::http::{SDK_CLIENT, SDK_CLIENT_HEADER};
use crate::signer::Signer;

/// How a WebSocket upgrade is authenticated. Both authenticated modes send the
/// `X-TinyPlace-*` upgrade headers; they differ only in the legacy URL-borne
/// credential they append for query-string backends.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WsAuth {
    /// No auth (public stream, or no signer configured).
    None,
    /// Agent `Authorization` also carried as an `authorization=` query param.
    Agent,
    /// Directory-write credentials also carried as signed `X-TinyPlace-*` query params.
    Directory,
}

/// How a stream that drops mid-flight is re-established.
///
/// Defaults mirror the TypeScript SDK's `TinyPlaceWebSocketOptions`: reconnect
/// enabled, a 3s pause between attempts, and at most 10 attempts.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ReconnectPolicy {
    /// Whether a dropped stream is re-dialled at all.
    pub enabled: bool,
    /// How long to wait before each attempt.
    pub interval: Duration,
    /// How many consecutive attempts to make before giving up.
    ///
    /// The counter resets as soon as a re-established stream carries *any*
    /// frame — a keepalive ping counts — so this bounds a run of consecutive
    /// failures rather than the lifetime total. A quiet stream still resets it;
    /// only a socket that produces nothing at all before dropping again does
    /// not.
    pub max_attempts: u32,
    /// How long a single re-dial may take before it counts as a failed attempt.
    ///
    /// `connect_async` has no timeout of its own, so a black-holed TCP connect
    /// or a handshake the server never answers would otherwise hang `recv`
    /// indefinitely and leave `max_attempts` bounding nothing.
    pub connect_timeout: Duration,
}

impl Default for ReconnectPolicy {
    fn default() -> Self {
        Self {
            enabled: true,
            interval: Duration::from_millis(3_000),
            max_attempts: 10,
            connect_timeout: Duration::from_secs(10),
        }
    }
}

impl ReconnectPolicy {
    /// A policy that never reconnects: `recv` reports the drop instead.
    pub fn disabled() -> Self {
        Self {
            enabled: false,
            ..Self::default()
        }
    }
}

/// An un-connected WebSocket handle. Cheap to build; opens the socket on
/// [`connect`](TinyPlaceWebSocket::connect).
#[derive(Clone)]
pub struct TinyPlaceWebSocket {
    origin: String,
    request_uri: String,
    signer: Option<Arc<dyn Signer>>,
    public_key: Option<String>,
    auth: WsAuth,
    reconnect: ReconnectPolicy,
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
            reconnect: ReconnectPolicy::default(),
        }
    }

    /// Override how a dropped stream is re-established.
    ///
    /// ```no_run
    /// # use tinyplace::{ReconnectPolicy, TinyPlaceClient};
    /// # async fn run(client: TinyPlaceClient) -> tinyplace::Result<()> {
    /// // Give up immediately, surfacing the drop to the caller.
    /// let mut conn = client
    ///     .inbox
    ///     .stream()
    ///     .with_reconnect(ReconnectPolicy::disabled())
    ///     .connect()
    ///     .await?;
    /// # let _ = conn.recv().await;
    /// # Ok(())
    /// # }
    /// ```
    pub fn with_reconnect(mut self, reconnect: ReconnectPolicy) -> Self {
        self.reconnect = reconnect;
        self
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

    /// The headers sent on the upgrade request: the SDK client tag, plus the
    /// signed `X-TinyPlace-*` credential when this stream is authenticated.
    /// Exposed for testing and diagnostics.
    pub async fn upgrade_headers(&self) -> Result<Headers> {
        let mut headers: Headers = vec![(SDK_CLIENT_HEADER.to_string(), SDK_CLIENT.to_string())];
        if let (WsAuth::Agent | WsAuth::Directory, Some(signer), Some(public_key)) =
            (self.auth, &self.signer, &self.public_key)
        {
            headers.extend(sign_websocket_upgrade(signer.as_ref(), public_key).await?);
        }
        Ok(headers)
    }

    /// Open the WebSocket and return a connection to read/write messages.
    ///
    /// This is a single attempt: a refused or unauthenticated upgrade returns
    /// the error rather than retrying, so a misconfigured client fails fast.
    /// [`ReconnectPolicy`] governs what happens to an *established* stream that
    /// later drops.
    pub async fn connect(&self) -> Result<WebSocketConnection> {
        let stream = self.dial().await?;
        Ok(WebSocketConnection {
            inner: stream,
            dialer: self.clone(),
            attempts: 0,
            last_dial_error: None,
        })
    }

    /// Run one full dial: sign the URL and the upgrade headers, then handshake.
    ///
    /// Every reconnect goes through here rather than replaying a stored request:
    /// [`sign_websocket_upgrade`] binds a timestamp and nonce, so a replayed
    /// upgrade would be rejected as stale.
    async fn dial(&self) -> Result<WebSocketStream<MaybeTlsStream<TcpStream>>> {
        let url = self.signed_url().await?;
        let mut request = url
            .as_str()
            .into_client_request()
            .map_err(|error| Error::WebSocket(error.to_string()))?;
        for (name, value) in self.upgrade_headers().await? {
            let name = HeaderName::try_from(name.as_str())
                .map_err(|error| Error::WebSocket(error.to_string()))?;
            let value = HeaderValue::try_from(value.as_str())
                .map_err(|error| Error::WebSocket(error.to_string()))?;
            request.headers_mut().insert(name, value);
        }
        let (stream, _response) = connect_async(request)
            .await
            .map_err(|error| Error::WebSocket(error.to_string()))?;
        Ok(stream)
    }
}

/// An open WebSocket connection. Read JSON messages with [`recv`](Self::recv),
/// push with [`send`](Self::send), and shut down with [`close`](Self::close).
pub struct WebSocketConnection {
    inner: WebSocketStream<MaybeTlsStream<TcpStream>>,
    /// The handle this was opened from, kept so a drop can be re-dialled.
    dialer: TinyPlaceWebSocket,
    /// Consecutive reconnect attempts since the stream last carried a frame.
    attempts: u32,
    /// Why the most recent re-dial failed, reported in preference to the older
    /// error that started the reconnect run.
    last_dial_error: Option<Error>,
}

impl WebSocketConnection {
    /// Await the next message, parsed as JSON. Ping/pong control frames are
    /// handled transparently and skipped.
    ///
    /// If the stream drops, it is re-dialled per the handle's
    /// [`ReconnectPolicy`] and the wait resumes — transparently to the caller.
    /// Returns `None` once the stream has closed and reconnecting is disabled or
    /// exhausted. A transport error is likewise reported only after reconnecting
    /// has been given up on.
    ///
    /// Note that a reconnect re-subscribes: anything the server published while
    /// the socket was down is not replayed, and a stream that opens with a
    /// snapshot frame will deliver a fresh one.
    pub async fn recv(&mut self) -> Option<Result<serde_json::Value>> {
        loop {
            match self.inner.next().await {
                Some(Ok(Message::Text(text))) => {
                    self.mark_healthy();
                    return Some(serde_json::from_str(&text).map_err(Error::from));
                }
                Some(Ok(Message::Binary(bytes))) => {
                    self.mark_healthy();
                    return Some(serde_json::from_slice(&bytes).map_err(Error::from));
                }
                Some(Ok(Message::Close(_))) | None => {
                    if self.reconnect().await {
                        continue;
                    }
                    return None;
                }
                Some(Ok(_)) => {
                    // A control frame is not handed to the caller, but it is
                    // still proof the replacement socket works — and on a quiet
                    // stream (an inbox with no new items) the server's keepalive
                    // pings are the *only* traffic. Resetting solely on data
                    // would let unrelated outages, days apart, accumulate until
                    // `max_attempts` was spent and the stream ended for good.
                    self.mark_healthy();
                    continue;
                }
                Some(Err(error)) => {
                    if self.reconnect().await {
                        continue;
                    }
                    // Prefer why the last re-dial failed over the older error
                    // that started the run: by now it describes the current
                    // state of the world, which is what a caller can act on.
                    return Some(Err(self
                        .last_dial_error
                        .take()
                        .unwrap_or_else(|| Error::WebSocket(error.to_string()))));
                }
            }
        }
    }

    /// Record that the socket is carrying traffic: the retry budget for the
    /// *next* outage starts over.
    ///
    /// Deliberately not "reset on open", which is what the TS SDK does: a server
    /// that accepts a connection and immediately drops it would then be retried
    /// forever. Requiring at least one frame keeps `max_attempts` a real bound
    /// on a genuinely broken endpoint.
    fn mark_healthy(&mut self) {
        self.attempts = 0;
        self.last_dial_error = None;
    }

    /// Re-dial the stream, reporting whether a fresh one was established.
    ///
    /// Pauses `interval` *before* each attempt so a server that drops
    /// connections instantly cannot be hammered, and bounds each attempt by
    /// `connect_timeout` so a stalled handshake cannot hang `recv` forever.
    async fn reconnect(&mut self) -> bool {
        let policy = self.dialer.reconnect;
        if !policy.enabled {
            return false;
        }
        while self.attempts < policy.max_attempts {
            self.attempts += 1;
            tokio::time::sleep(policy.interval).await;
            match tokio::time::timeout(policy.connect_timeout, self.dialer.dial()).await {
                Ok(Ok(stream)) => {
                    self.inner = stream;
                    self.last_dial_error = None;
                    return true;
                }
                Ok(Err(error)) => self.last_dial_error = Some(error),
                Err(_) => {
                    self.last_dial_error = Some(Error::WebSocket(format!(
                        "reconnect timed out after {:?}",
                        policy.connect_timeout
                    )))
                }
            }
        }
        false
    }

    /// Send a JSON message to the server.
    pub async fn send(&mut self, value: &serde_json::Value) -> Result<()> {
        let text = serde_json::to_string(value)?;
        self.inner
            .send(Message::Text(text.into()))
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
