//! The HTTP client backing every API namespace. Mirrors
//! `sdk/typescript/src/http.ts`: it owns the base URL, the optional agent and
//! admin signers, and exposes one helper per (method, auth-mode) combination.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use base64::Engine as _;
use reqwest::{Method, Response, StatusCode};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use tokio::time::sleep;

/// The default per-request timeout when none is configured.
pub const DEFAULT_TIMEOUT: Duration = Duration::from_secs(30);

/// Controls automatic retry-with-backoff for transient failures (the backend
/// being slow, briefly down, or returning a 5xx/429). To avoid silently
/// duplicating a write, only idempotent methods are retried by default.
#[derive(Clone)]
pub struct RetryOptions {
    /// Max retry attempts after the first try. `0` disables retries.
    pub retries: u32,
    /// Base backoff delay (exponential, with jitter).
    pub base_delay: Duration,
    /// Upper bound on a single backoff delay.
    pub max_delay: Duration,
    /// HTTP statuses treated as transient.
    pub retryable_statuses: Vec<u16>,
    /// HTTP methods eligible for retry (idempotent reads only by default).
    pub retry_methods: Vec<Method>,
    /// Retry connection-level failures (timeout, refused, DNS) for eligible methods.
    pub retry_network_errors: bool,
}

impl Default for RetryOptions {
    fn default() -> Self {
        Self {
            retries: 2,
            base_delay: Duration::from_millis(200),
            max_delay: Duration::from_secs(5),
            retryable_statuses: vec![408, 429, 500, 502, 503, 504],
            retry_methods: vec![Method::GET, Method::HEAD, Method::OPTIONS],
            retry_network_errors: true,
        }
    }
}

/// Exponential backoff (capped) with half jitter for the given attempt index.
fn backoff_delay(retry: &RetryOptions, attempt: u32) -> Duration {
    let factor = 2u32.checked_pow(attempt).unwrap_or(u32::MAX);
    let exp = retry
        .base_delay
        .checked_mul(factor)
        .unwrap_or(retry.max_delay);
    let capped = std::cmp::min(exp, retry.max_delay);
    let half = capped / 2;
    let half_nanos = half.as_nanos() as u64;
    let jitter = if half_nanos == 0 {
        0
    } else {
        rand::random::<u64>() % (half_nanos + 1)
    };
    half + Duration::from_nanos(jitter)
}

/// Parse a `Retry-After` header (delta-seconds form) into a delay.
fn retry_after_delay(response: &Response) -> Option<Duration> {
    let value = response.headers().get("retry-after")?.to_str().ok()?;
    value.trim().parse::<u64>().ok().map(Duration::from_secs)
}

use crate::auth::{
    sign_admin_request, sign_directory_write, sign_request, AdminSigningOptions, Headers,
};
use crate::error::{Error, PaymentChallenge, PaymentRequiredChallenge, Result};
use crate::signer::Signer;
use crate::websocket::{TinyPlaceWebSocket, WsAuth};

/// A list of query parameters. Arrays are expressed as repeated keys.
pub type Query = [(String, String)];

/// Callback invoked on a 401/403 response, before the error is returned.
pub type AuthInvalidHook = Arc<dyn Fn(u16, &serde_json::Value) + Send + Sync>;

#[derive(Clone, Copy)]
enum Auth {
    /// No auth headers.
    None,
    /// Agent `Authorization: tiny.place ...` over `body + timestamp`.
    Signed,
    /// Directory-write headers; `X-Agent-ID` is the actor (or the public key).
    Directory,
    /// Directory-write headers; `X-Agent-ID` is the signer's agent id.
    Agent,
    /// `TinyPlace-Admin` headers.
    Admin,
}

/// Auth mode for `POST /graphql`.
#[derive(Clone, Copy, Debug, Default)]
pub enum GraphQLAuth {
    /// No auth headers.
    #[default]
    None,
    /// Agent-authenticated request, used by viewer-scoped reads like home feed.
    Agent,
    /// Generic signed request.
    Signed,
    /// Directory-authenticated request.
    Directory,
}

/// Configuration for [`HttpClient`].
#[derive(Default)]
pub struct HttpClientOptions {
    pub base_url: String,
    pub signer: Option<Arc<dyn Signer>>,
    pub admin_signer: Option<Arc<dyn Signer>>,
    pub admin: AdminSigningOptions,
    pub on_auth_invalid: Option<AuthInvalidHook>,
    /// Per-request timeout. `None` uses [`DEFAULT_TIMEOUT`] (30s);
    /// `Some(Duration::ZERO)` disables the timeout.
    pub timeout: Option<Duration>,
    /// Retry-with-backoff policy for transient failures.
    pub retry: RetryOptions,
}

/// The shared HTTP client. Cheap to clone (everything is `Arc`-backed).
#[derive(Clone)]
pub struct HttpClient {
    inner: Arc<HttpClientInner>,
}

struct HttpClientInner {
    base_url: String,
    client: reqwest::Client,
    signer: Option<Arc<dyn Signer>>,
    public_key_base64: Option<String>,
    admin_signer: Option<Arc<dyn Signer>>,
    admin: AdminSigningOptions,
    on_auth_invalid: Option<AuthInvalidHook>,
    retry: RetryOptions,
}

impl HttpClient {
    pub fn new(options: HttpClientOptions) -> Self {
        let base_url = options.base_url.trim_end_matches('/').to_string();
        let public_key_base64 = options.signer.as_ref().map(|s| s.public_key_base64());
        let timeout = options.timeout.unwrap_or(DEFAULT_TIMEOUT);
        let mut builder = reqwest::Client::builder();
        if !timeout.is_zero() {
            builder = builder.timeout(timeout);
        }
        let client = builder.build().unwrap_or_else(|_| reqwest::Client::new());
        Self {
            inner: Arc::new(HttpClientInner {
                base_url,
                client,
                signer: options.signer,
                public_key_base64,
                admin_signer: options.admin_signer,
                admin: options.admin,
                on_auth_invalid: options.on_auth_invalid,
                retry: options.retry,
            }),
        }
    }

    /// The base URL the client targets (without a trailing slash).
    pub fn base_url(&self) -> &str {
        &self.inner.base_url
    }

    /// The base64 public key presented for signed requests, if a signer is set.
    pub fn signing_public_key(&self) -> Option<String> {
        self.inner.public_key_base64.clone()
    }

    /// The configured agent signer, if any. API modules use this to produce
    /// canonical-payload signatures bound into request bodies.
    pub fn signer(&self) -> Option<Arc<dyn Signer>> {
        self.inner.signer.clone()
    }

    /// Build an un-connected [`TinyPlaceWebSocket`] for `request_uri` (a
    /// `path?query`). The base URL's scheme is mapped `http(s)` → `ws(s)`. When
    /// `directory_auth` is set the upgrade is signed with directory-write query
    /// params; otherwise the agent `Authorization` is carried as a query param
    /// (both fall back to no auth when no signer is configured).
    pub fn websocket(&self, request_uri: &str, directory_auth: bool) -> TinyPlaceWebSocket {
        let origin = self.inner.base_url.replacen("http", "ws", 1);
        let auth = if directory_auth {
            WsAuth::Directory
        } else if self.inner.signer.is_some() {
            WsAuth::Agent
        } else {
            WsAuth::None
        };
        TinyPlaceWebSocket::new(
            origin,
            request_uri.to_string(),
            self.inner.signer.clone(),
            self.inner.public_key_base64.clone(),
            auth,
        )
    }

    // --- core request pipeline -------------------------------------------------

    #[allow(clippy::too_many_arguments)]
    async fn execute(
        &self,
        method: Method,
        path: &str,
        query: &Query,
        body_str: Option<String>,
        auth: Auth,
        directory_actor: Option<&str>,
        extra_headers: &[(String, String)],
    ) -> Result<Response> {
        let query_string = build_query(query);
        let request_uri = format!("{path}{query_string}");
        let url = format!("{}{request_uri}", self.inner.base_url);
        let body = body_str.unwrap_or_default();

        let retry = &self.inner.retry;
        let eligible =
            retry.retries > 0 && retry.retry_methods.iter().any(|allowed| allowed == &method);
        let mut attempt: u32 = 0;
        loop {
            // Re-sign on every attempt so retries carry a fresh timestamp/nonce
            // and are never rejected as a replay.
            let mut headers: Headers =
                vec![("Content-Type".to_string(), "application/json".to_string())];
            headers.extend(extra_headers.iter().cloned());
            self.apply_auth(
                &mut headers,
                &method,
                &request_uri,
                &body,
                auth,
                directory_actor,
            )
            .await?;

            let mut builder = self.inner.client.request(method.clone(), &url);
            for (name, value) in &headers {
                builder = builder.header(name.as_str(), value.as_str());
            }
            if !body.is_empty() {
                builder = builder.body(body.clone());
            }

            match builder.send().await {
                Ok(response) => {
                    if response.status().is_success() {
                        return Ok(response);
                    }
                    let status = response.status().as_u16();
                    if eligible
                        && attempt < retry.retries
                        && retry.retryable_statuses.contains(&status)
                    {
                        let wait = retry_after_delay(&response)
                            .unwrap_or_else(|| backoff_delay(retry, attempt));
                        attempt += 1;
                        sleep(wait).await;
                        continue;
                    }
                    return Err(self.error_from_response(path, response).await);
                }
                Err(err) => {
                    // Connection-level failure (timeout, refused, DNS): retry
                    // eligible idempotent methods, otherwise surface the typed
                    // transport error.
                    if eligible && attempt < retry.retries && retry.retry_network_errors {
                        let wait = backoff_delay(retry, attempt);
                        attempt += 1;
                        sleep(wait).await;
                        continue;
                    }
                    return Err(Error::from(err));
                }
            }
        }
    }

    async fn apply_auth(
        &self,
        headers: &mut Headers,
        method: &Method,
        request_uri: &str,
        body: &str,
        auth: Auth,
        directory_actor: Option<&str>,
    ) -> Result<()> {
        match auth {
            Auth::None => {}
            Auth::Admin => {
                if let Some(signer) = &self.inner.admin_signer {
                    let admin = sign_admin_request(
                        signer.as_ref(),
                        method.as_str(),
                        request_uri,
                        body,
                        &self.inner.admin,
                    )
                    .await?;
                    headers.extend(admin);
                }
            }
            Auth::Directory | Auth::Agent => {
                if let (Some(signer), Some(public_key)) =
                    (&self.inner.signer, &self.inner.public_key_base64)
                {
                    let write = sign_directory_write(
                        signer.as_ref(),
                        public_key,
                        method.as_str(),
                        request_uri,
                        body,
                    )
                    .await?;
                    headers.extend(write);
                    let agent_id = match auth {
                        Auth::Agent => signer.agent_id(),
                        _ => directory_actor
                            .map(str::to_string)
                            .unwrap_or_else(|| public_key.clone()),
                    };
                    headers.push(("X-Agent-ID".to_string(), agent_id));
                }
            }
            Auth::Signed => {
                if let Some(signer) = &self.inner.signer {
                    let auth_headers = sign_request(signer.as_ref(), body).await?;
                    headers.extend(auth_headers);
                }
            }
        }
        Ok(())
    }

    async fn error_from_response(&self, path: &str, response: Response) -> Error {
        let status = response.status();
        let header_map = collect_headers(&response);
        let payment_required = payment_required_from_header(&header_map);
        let text = response.text().await.unwrap_or_default();
        let body: serde_json::Value = match serde_json::from_str(&text) {
            Ok(value) => value,
            Err(_) => serde_json::Value::String(text),
        };
        let payment_required = payment_required.or_else(|| payment_required_from_body(&body));

        if (status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN)
            && self.inner.on_auth_invalid.is_some()
        {
            if let Some(hook) = &self.inner.on_auth_invalid {
                hook(status.as_u16(), &body);
            }
        }

        Error::Http(Box::new(crate::error::HttpError {
            status: status.as_u16(),
            message: format!("HTTP {}: {path}", status.as_u16()),
            body,
            headers: header_map,
            payment_required,
        }))
    }

    async fn parse<T: DeserializeOwned>(&self, response: Response) -> Result<T> {
        if response.status() == StatusCode::NO_CONTENT {
            return Ok(serde_json::from_value(serde_json::Value::Null)?);
        }
        let text = response.text().await?;
        if text.is_empty() {
            return Ok(serde_json::from_value(serde_json::Value::Null)?);
        }
        Ok(serde_json::from_str(&text)?)
    }

    async fn parse_graphql<T: DeserializeOwned>(&self, response: Response) -> Result<T> {
        let body: GraphQLResponse<T> = self.parse(response).await?;
        if let Some(errors) = body.errors {
            let message = errors
                .iter()
                .map(|err| err.message.as_str())
                .collect::<Vec<_>>()
                .join("; ");
            return Err(Error::Http(Box::new(crate::error::HttpError {
                status: 200,
                message: if message.is_empty() {
                    "GraphQL errors".to_string()
                } else {
                    message
                },
                body: serde_json::to_value(&errors).unwrap_or(serde_json::Value::Null),
                headers: HashMap::new(),
                payment_required: None,
            })));
        }
        body.data
            .ok_or_else(|| Error::InvalidArgument("GraphQL response missing data".into()))
    }

    fn body_string<B: Serialize>(body: Option<&B>) -> Result<Option<String>> {
        match body {
            Some(value) => Ok(Some(serde_json::to_string(value)?)),
            None => Ok(None),
        }
    }

    // --- GET -------------------------------------------------------------------

    pub async fn get<T: DeserializeOwned>(&self, path: &str, query: &Query) -> Result<T> {
        let response = self
            .execute(Method::GET, path, query, None, Auth::None, None, &[])
            .await?;
        self.parse(response).await
    }

    pub async fn get_auth<T: DeserializeOwned>(&self, path: &str, query: &Query) -> Result<T> {
        let response = self
            .execute(Method::GET, path, query, None, Auth::Signed, None, &[])
            .await?;
        self.parse(response).await
    }

    pub async fn get_admin<T: DeserializeOwned>(&self, path: &str, query: &Query) -> Result<T> {
        let response = self
            .execute(Method::GET, path, query, None, Auth::Admin, None, &[])
            .await?;
        self.parse(response).await
    }

    pub async fn get_text(&self, path: &str, query: &Query) -> Result<String> {
        let response = self
            .execute(Method::GET, path, query, None, Auth::None, None, &[])
            .await?;
        Ok(response.text().await?)
    }

    pub async fn get_directory_auth<T: DeserializeOwned>(
        &self,
        path: &str,
        query: &Query,
    ) -> Result<T> {
        let response = self
            .execute(Method::GET, path, query, None, Auth::Directory, None, &[])
            .await?;
        self.parse(response).await
    }

    pub async fn get_directory_auth_as<T: DeserializeOwned>(
        &self,
        path: &str,
        actor: &str,
        query: &Query,
    ) -> Result<T> {
        let response = self
            .execute(
                Method::GET,
                path,
                query,
                None,
                Auth::Directory,
                Some(actor),
                &[],
            )
            .await?;
        self.parse(response).await
    }

    pub async fn get_agent_auth<T: DeserializeOwned>(
        &self,
        path: &str,
        query: &Query,
    ) -> Result<T> {
        let response = self
            .execute(Method::GET, path, query, None, Auth::Agent, None, &[])
            .await?;
        self.parse(response).await
    }

    // --- raw GET (caller reads the body) --------------------------------------

    pub async fn get_raw(&self, path: &str, query: &Query, headers: &Headers) -> Result<Response> {
        self.execute(Method::GET, path, query, None, Auth::None, None, headers)
            .await
    }

    pub async fn get_auth_raw(&self, path: &str, query: &Query) -> Result<Response> {
        self.execute(Method::GET, path, query, None, Auth::Signed, None, &[])
            .await
    }

    pub async fn get_directory_auth_raw(&self, path: &str, query: &Query) -> Result<Response> {
        self.execute(Method::GET, path, query, None, Auth::Directory, None, &[])
            .await
    }

    pub async fn get_directory_auth_raw_as(
        &self,
        path: &str,
        actor: &str,
        query: &Query,
    ) -> Result<Response> {
        self.execute(
            Method::GET,
            path,
            query,
            None,
            Auth::Directory,
            Some(actor),
            &[],
        )
        .await
    }

    // --- POST ------------------------------------------------------------------

    /// Execute a read-only GraphQL query against `POST /graphql`.
    pub async fn graphql<T: DeserializeOwned, V: Serialize>(
        &self,
        query: &str,
        variables: Option<&V>,
        auth: GraphQLAuth,
        operation_name: Option<&str>,
    ) -> Result<T> {
        let body = GraphQLRequest {
            query,
            variables,
            operation_name,
        };
        let body = Self::body_string(Some(&body))?;
        let auth = match auth {
            GraphQLAuth::None => Auth::None,
            GraphQLAuth::Agent => Auth::Agent,
            GraphQLAuth::Signed => Auth::Signed,
            GraphQLAuth::Directory => Auth::Directory,
        };
        let response = self
            .execute(Method::POST, "/graphql", &[], body, auth, None, &[])
            .await?;
        self.parse_graphql(response).await
    }

    pub async fn post<T: DeserializeOwned, B: Serialize>(
        &self,
        path: &str,
        body: Option<&B>,
    ) -> Result<T> {
        let body = Self::body_string(body)?;
        let response = self
            .execute(Method::POST, path, &[], body, Auth::Signed, None, &[])
            .await?;
        self.parse(response).await
    }

    pub async fn post_admin<T: DeserializeOwned, B: Serialize>(
        &self,
        path: &str,
        body: Option<&B>,
    ) -> Result<T> {
        let body = Self::body_string(body)?;
        let response = self
            .execute(Method::POST, path, &[], body, Auth::Admin, None, &[])
            .await?;
        self.parse(response).await
    }

    pub async fn post_public<T: DeserializeOwned, B: Serialize>(
        &self,
        path: &str,
        body: Option<&B>,
    ) -> Result<T> {
        let body = Self::body_string(body)?;
        let response = self
            .execute(Method::POST, path, &[], body, Auth::None, None, &[])
            .await?;
        self.parse(response).await
    }

    pub async fn post_public_raw<B: Serialize>(
        &self,
        path: &str,
        body: Option<&B>,
        headers: &Headers,
    ) -> Result<Response> {
        let body = Self::body_string(body)?;
        self.execute(Method::POST, path, &[], body, Auth::None, None, headers)
            .await
    }

    pub async fn post_agent_auth<T: DeserializeOwned, B: Serialize>(
        &self,
        path: &str,
        body: Option<&B>,
    ) -> Result<T> {
        let body = Self::body_string(body)?;
        let response = self
            .execute(Method::POST, path, &[], body, Auth::Agent, None, &[])
            .await?;
        self.parse(response).await
    }

    pub async fn post_directory_auth<T: DeserializeOwned, B: Serialize>(
        &self,
        path: &str,
        body: Option<&B>,
    ) -> Result<T> {
        let body = Self::body_string(body)?;
        let response = self
            .execute(Method::POST, path, &[], body, Auth::Directory, None, &[])
            .await?;
        self.parse(response).await
    }

    pub async fn post_directory_auth_as<T: DeserializeOwned, B: Serialize>(
        &self,
        path: &str,
        actor: &str,
        body: Option<&B>,
    ) -> Result<T> {
        let body = Self::body_string(body)?;
        let response = self
            .execute(
                Method::POST,
                path,
                &[],
                body,
                Auth::Directory,
                Some(actor),
                &[],
            )
            .await?;
        self.parse(response).await
    }

    // --- PUT -------------------------------------------------------------------

    pub async fn put<T: DeserializeOwned, B: Serialize>(
        &self,
        path: &str,
        body: Option<&B>,
    ) -> Result<T> {
        let body = Self::body_string(body)?;
        let response = self
            .execute(Method::PUT, path, &[], body, Auth::Signed, None, &[])
            .await?;
        self.parse(response).await
    }

    pub async fn put_admin<T: DeserializeOwned, B: Serialize>(
        &self,
        path: &str,
        body: Option<&B>,
    ) -> Result<T> {
        let body = Self::body_string(body)?;
        let response = self
            .execute(Method::PUT, path, &[], body, Auth::Admin, None, &[])
            .await?;
        self.parse(response).await
    }

    pub async fn put_directory_auth<T: DeserializeOwned, B: Serialize>(
        &self,
        path: &str,
        body: Option<&B>,
    ) -> Result<T> {
        let body = Self::body_string(body)?;
        let response = self
            .execute(Method::PUT, path, &[], body, Auth::Directory, None, &[])
            .await?;
        self.parse(response).await
    }

    pub async fn put_directory_auth_as<T: DeserializeOwned, B: Serialize>(
        &self,
        path: &str,
        actor: &str,
        body: Option<&B>,
    ) -> Result<T> {
        let body = Self::body_string(body)?;
        let response = self
            .execute(
                Method::PUT,
                path,
                &[],
                body,
                Auth::Directory,
                Some(actor),
                &[],
            )
            .await?;
        self.parse(response).await
    }

    pub async fn put_agent_auth<T: DeserializeOwned, B: Serialize>(
        &self,
        path: &str,
        body: Option<&B>,
    ) -> Result<T> {
        let body = Self::body_string(body)?;
        let response = self
            .execute(Method::PUT, path, &[], body, Auth::Agent, None, &[])
            .await?;
        self.parse(response).await
    }

    // --- DELETE ----------------------------------------------------------------

    pub async fn delete<T: DeserializeOwned, B: Serialize>(
        &self,
        path: &str,
        body: Option<&B>,
    ) -> Result<T> {
        let body = Self::body_string(body)?;
        let response = self
            .execute(Method::DELETE, path, &[], body, Auth::Signed, None, &[])
            .await?;
        self.parse(response).await
    }

    pub async fn delete_public<T: DeserializeOwned, B: Serialize>(
        &self,
        path: &str,
        body: Option<&B>,
        headers: &Headers,
    ) -> Result<T> {
        let body = Self::body_string(body)?;
        let response = self
            .execute(Method::DELETE, path, &[], body, Auth::None, None, headers)
            .await?;
        self.parse(response).await
    }

    pub async fn delete_admin<T: DeserializeOwned, B: Serialize>(
        &self,
        path: &str,
        body: Option<&B>,
    ) -> Result<T> {
        let body = Self::body_string(body)?;
        let response = self
            .execute(Method::DELETE, path, &[], body, Auth::Admin, None, &[])
            .await?;
        self.parse(response).await
    }

    pub async fn delete_directory_auth<T: DeserializeOwned, B: Serialize>(
        &self,
        path: &str,
        body: Option<&B>,
    ) -> Result<T> {
        let body = Self::body_string(body)?;
        let response = self
            .execute(Method::DELETE, path, &[], body, Auth::Directory, None, &[])
            .await?;
        self.parse(response).await
    }

    pub async fn delete_directory_auth_as<T: DeserializeOwned, B: Serialize>(
        &self,
        path: &str,
        actor: &str,
        body: Option<&B>,
    ) -> Result<T> {
        let body = Self::body_string(body)?;
        let response = self
            .execute(
                Method::DELETE,
                path,
                &[],
                body,
                Auth::Directory,
                Some(actor),
                &[],
            )
            .await?;
        self.parse(response).await
    }

    pub async fn delete_agent_auth<T: DeserializeOwned, B: Serialize>(
        &self,
        path: &str,
        body: Option<&B>,
    ) -> Result<T> {
        let body = Self::body_string(body)?;
        let response = self
            .execute(Method::DELETE, path, &[], body, Auth::Agent, None, &[])
            .await?;
        self.parse(response).await
    }
}

#[derive(Serialize)]
struct GraphQLRequest<'a, V: Serialize> {
    query: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    variables: Option<&'a V>,
    #[serde(rename = "operationName", skip_serializing_if = "Option::is_none")]
    operation_name: Option<&'a str>,
}

#[derive(Deserialize)]
struct GraphQLResponse<T> {
    data: Option<T>,
    #[serde(default)]
    errors: Option<Vec<GraphQLError>>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQLError {
    message: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    path: Option<Vec<serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    extensions: Option<serde_json::Value>,
}

/// Build a `?a=b&c=d` query string (empty when there are no params), matching
/// the TS `buildQuery` encoding.
pub fn build_query(params: &Query) -> String {
    if params.is_empty() {
        return String::new();
    }
    let parts: Vec<String> = params
        .iter()
        .map(|(key, value)| format!("{}={}", url_encode(key), url_encode(value)))
        .collect();
    format!("?{}", parts.join("&"))
}

/// `encodeURIComponent`-compatible percent encoding.
fn url_encode(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z'
            | b'a'..=b'z'
            | b'0'..=b'9'
            | b'-'
            | b'_'
            | b'.'
            | b'!'
            | b'~'
            | b'*'
            | b'\''
            | b'('
            | b')' => out.push(byte as char),
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

fn collect_headers(response: &Response) -> HashMap<String, String> {
    let mut map = HashMap::new();
    for (name, value) in response.headers() {
        if let Ok(value) = value.to_str() {
            map.insert(name.as_str().to_lowercase(), value.to_string());
        }
    }
    map
}

fn payment_required_from_header(
    headers: &HashMap<String, String>,
) -> Option<PaymentRequiredChallenge> {
    let encoded = headers.get("x-payment-required")?;
    let decoded = base64_url_decode(encoded)?;
    let value: serde_json::Value = serde_json::from_slice(&decoded).ok()?;
    as_payment_required(&value)
}

fn payment_required_from_body(body: &serde_json::Value) -> Option<PaymentRequiredChallenge> {
    as_payment_required(body)
}

fn as_payment_required(value: &serde_json::Value) -> Option<PaymentRequiredChallenge> {
    let payment = value.get("payment")?;
    if !payment.is_object() {
        return None;
    }
    let payment: PaymentChallenge = serde_json::from_value(payment.clone()).ok()?;
    let error = value
        .get("error")
        .and_then(|v| v.as_str())
        .map(str::to_string);
    Some(PaymentRequiredChallenge { error, payment })
}

fn base64_url_decode(value: &str) -> Option<Vec<u8>> {
    base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(value)
        .or_else(|_| base64::engine::general_purpose::URL_SAFE.decode(value))
        .ok()
}
