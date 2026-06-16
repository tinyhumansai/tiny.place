//! The HTTP client backing every API namespace. Mirrors
//! `sdk/typescript/src/http.ts`: it owns the base URL, the optional agent and
//! admin signers, and exposes one helper per (method, auth-mode) combination.

use std::collections::HashMap;
use std::sync::Arc;

use base64::Engine as _;
use reqwest::{Method, Response, StatusCode};
use serde::de::DeserializeOwned;
use serde::Serialize;

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

/// Configuration for [`HttpClient`].
#[derive(Default)]
pub struct HttpClientOptions {
    pub base_url: String,
    pub signer: Option<Arc<dyn Signer>>,
    pub admin_signer: Option<Arc<dyn Signer>>,
    pub admin: AdminSigningOptions,
    pub on_auth_invalid: Option<AuthInvalidHook>,
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
}

impl HttpClient {
    pub fn new(options: HttpClientOptions) -> Self {
        let base_url = options.base_url.trim_end_matches('/').to_string();
        let public_key_base64 = options.signer.as_ref().map(|s| s.public_key_base64());
        Self {
            inner: Arc::new(HttpClientInner {
                base_url,
                client: reqwest::Client::new(),
                signer: options.signer,
                public_key_base64,
                admin_signer: options.admin_signer,
                admin: options.admin,
                on_auth_invalid: options.on_auth_invalid,
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

        let mut builder = self.inner.client.request(method, &url);
        for (name, value) in &headers {
            builder = builder.header(name.as_str(), value.as_str());
        }
        if !body.is_empty() {
            builder = builder.body(body);
        }

        let response = builder.send().await?;
        if response.status().is_success() {
            return Ok(response);
        }
        Err(self.error_from_response(path, response).await)
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
