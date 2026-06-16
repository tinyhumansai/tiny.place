//! Request authentication. Mirrors `sdk/typescript/src/auth.ts`.
//!
//! Three signing schemes, all Ed25519:
//! - **agent auth** (`Authorization: tiny.place <agentId>:<sig>:<ts>`) — sign `body + timestamp`.
//! - **directory write** (`X-TinyPlace-*` headers) — sign `METHOD\nURI\nts\nnonce\nsha256(body)`.
//! - **admin** (`Authorization: TinyPlace-Admin ...`) — as above plus an optional role line.

use rand::RngCore as _;

use crate::crypto::{sha256_hex, to_base64, to_base64_url};
use crate::error::Result;
use crate::signer::Signer;
use crate::util::encode;

/// A list of HTTP header name/value pairs.
pub type Headers = Vec<(String, String)>;

/// Admin actor/role bound into `TinyPlace-Admin` signatures.
#[derive(Debug, Clone, Default)]
pub struct AdminSigningOptions {
    pub actor: Option<String>,
    /// `"operator"` or `"auditor"`.
    pub role: Option<String>,
}

/// Current UTC timestamp in `YYYY-MM-DDTHH:MM:SS.sssZ` form (matches JS `toISOString`).
pub fn timestamp() -> String {
    chrono::Utc::now()
        .format("%Y-%m-%dT%H:%M:%S%.3fZ")
        .to_string()
}

/// A fresh base64-encoded 16-byte random nonce.
pub fn generate_nonce() -> String {
    let mut bytes = [0u8; 16];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    to_base64(&bytes)
}

/// Build the agent `Authorization` header value.
pub fn build_auth_header(agent_id: &str, signature: &str, timestamp: &str) -> String {
    format!("tiny.place {agent_id}:{signature}:{timestamp}")
}

/// Sign an agent request: signature over `body + timestamp`.
pub async fn sign_request(signer: &dyn Signer, body: &str) -> Result<Headers> {
    let ts = timestamp();
    let payload = format!("{body}{ts}");
    let signature = signer.sign(payload.as_bytes()).await?;
    Ok(vec![(
        "Authorization".to_string(),
        build_auth_header(&signer.agent_id(), &to_base64(&signature), &ts),
    )])
}

/// Sign an admin request.
pub async fn sign_admin_request(
    signer: &dyn Signer,
    method: &str,
    request_uri: &str,
    body: &str,
    options: &AdminSigningOptions,
) -> Result<Headers> {
    let ts = timestamp();
    let nonce = generate_nonce();
    let actor = options.actor.clone().unwrap_or_else(|| signer.agent_id());
    let body_hash = sha256_hex(body.as_bytes());
    let role_line = options
        .role
        .as_ref()
        .map(|role| format!("\n{role}"))
        .unwrap_or_default();
    let payload = format!("{method}\n{request_uri}\n{ts}\n{nonce}\n{body_hash}{role_line}");
    let signature = signer.sign(payload.as_bytes()).await?;
    let role_field = options
        .role
        .as_ref()
        .map(|role| format!(",role=\"{role}\""))
        .unwrap_or_default();
    Ok(vec![
        (
            "Authorization".to_string(),
            format!(
                "TinyPlace-Admin actor=\"{actor}\"{role_field},signature=\"{}\"",
                to_base64(&signature)
            ),
        ),
        ("X-TinyPlace-Date".to_string(), ts),
        ("X-TinyPlace-Nonce".to_string(), nonce),
    ])
}

/// Sign a directory-write request, returning the `X-TinyPlace-*` headers.
pub async fn sign_directory_write(
    signer: &dyn Signer,
    public_key_base64: &str,
    method: &str,
    request_uri: &str,
    body: &str,
) -> Result<Headers> {
    let ts = timestamp();
    let nonce = generate_nonce();
    let body_hash = sha256_hex(body.as_bytes());
    let payload = format!("{method}\n{request_uri}\n{ts}\n{nonce}\n{body_hash}");
    let signature = signer.sign(payload.as_bytes()).await?;
    Ok(vec![
        ("X-TinyPlace-Date".to_string(), ts),
        ("X-TinyPlace-Nonce".to_string(), nonce),
        (
            "X-TinyPlace-Public-Key".to_string(),
            public_key_base64.to_string(),
        ),
        ("X-TinyPlace-Signature".to_string(), to_base64(&signature)),
    ])
}

/// Sign a directory-write request as query parameters, returning the signed
/// request URI (path + query). Used for WebSocket upgrades, where custom headers
/// can't be set, so the `X-TinyPlace-*` credentials travel as query params.
/// Mirrors `signDirectoryWriteQuery` in `sdk/typescript/src/auth.ts`.
pub async fn sign_directory_write_query(
    signer: &dyn Signer,
    public_key_base64: &str,
    method: &str,
    request_uri: &str,
    body: &str,
) -> Result<String> {
    let ts = timestamp();
    let nonce = generate_nonce();
    let unsigned_uri = with_query_params(
        request_uri,
        &[
            ("X-TinyPlace-Date", &ts),
            ("X-TinyPlace-Nonce", &nonce),
            ("X-TinyPlace-Public-Key", public_key_base64),
        ],
    );
    let body_hash = sha256_hex(body.as_bytes());
    let payload = format!("{method}\n{unsigned_uri}\n{ts}\n{nonce}\n{body_hash}");
    let signature = signer.sign(payload.as_bytes()).await?;
    Ok(with_query_params(
        &unsigned_uri,
        &[("X-TinyPlace-Signature", &to_base64(&signature))],
    ))
}

/// Build the query string the agent `Authorization` header is carried in for
/// WebSocket upgrades (`?authorization=<urlencoded>`), since headers can't be
/// set on a browser/standard WS handshake.
pub async fn sign_request_query(signer: &dyn Signer, request_uri: &str) -> Result<String> {
    let headers = sign_request(signer, "").await?;
    let authorization = headers
        .into_iter()
        .find(|(name, _)| name == "Authorization")
        .map(|(_, value)| value)
        .unwrap_or_default();
    Ok(with_query_params(
        request_uri,
        &[("authorization", &authorization)],
    ))
}

/// Add query parameters to a request URI and return `path?sorted-encoded-query`.
/// Params (existing + added) are sorted by key and `encodeURIComponent`-encoded,
/// matching the TS `withQueryParams` so signed URIs are reproducible.
fn with_query_params(request_uri: &str, params: &[(&str, &str)]) -> String {
    let (path, existing) = match request_uri.split_once('?') {
        Some((path, query)) => (path, query),
        None => (request_uri, ""),
    };

    let mut pairs: Vec<(String, String)> = Vec::new();
    for pair in existing.split('&').filter(|s| !s.is_empty()) {
        let (key, value) = match pair.split_once('=') {
            Some((key, value)) => (key, value),
            None => (pair, ""),
        };
        pairs.push((decode_component(key), decode_component(value)));
    }
    for (key, value) in params {
        // `URLSearchParams.set` replaces any existing entry with the same key.
        pairs.retain(|(existing_key, _)| existing_key != key);
        pairs.push((key.to_string(), value.to_string()));
    }

    pairs.sort_by(|(left, _), (right, _)| left.cmp(right));
    let query = pairs
        .iter()
        .map(|(key, value)| format!("{}={}", encode(key), encode(value)))
        .collect::<Vec<_>>()
        .join("&");

    if query.is_empty() {
        path.to_string()
    } else {
        format!("{path}?{query}")
    }
}

/// Percent-decode a query component (reverse of `encodeURIComponent`) so an
/// already-encoded incoming URI is re-encoded consistently after sorting.
fn decode_component(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        match bytes[index] {
            b'%' if index + 2 < bytes.len() => {
                let hex = std::str::from_utf8(&bytes[index + 1..index + 3]).unwrap_or("");
                match u8::from_str_radix(hex, 16) {
                    Ok(byte) => {
                        out.push(byte);
                        index += 3;
                    }
                    Err(_) => {
                        out.push(b'%');
                        index += 1;
                    }
                }
            }
            byte => {
                out.push(byte);
                index += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Sign a bare canonical payload, returning the base64 signature.
pub async fn sign_canonical_payload(signer: &dyn Signer, payload: &str) -> Result<String> {
    let signature = signer.sign(payload.as_bytes()).await?;
    Ok(to_base64(&signature))
}

/// Sign a canonical payload with freshness binding, returning a
/// `v1:<b64url(ts)>:<b64url(nonce)>:<b64(sig)>` token.
pub async fn sign_fresh_canonical_payload(signer: &dyn Signer, payload: &str) -> Result<String> {
    let ts = timestamp();
    let nonce = generate_nonce();
    let signed = format!("{payload}\n{ts}\n{nonce}");
    let signature = signer.sign(signed.as_bytes()).await?;
    Ok(format!(
        "v1:{}:{}:{}",
        to_base64_url(&ts),
        to_base64_url(&nonce),
        to_base64(&signature)
    ))
}
