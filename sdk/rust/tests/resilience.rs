//! Transport-resilience tests: retry-with-backoff for transient failures and a
//! timeout that surfaces a typed error when the backend is unreachable. These
//! drive the `HttpClient` directly (like `http_pipeline.rs`) so they do not
//! depend on any namespace method names.

use std::time::Duration;

use tinyplace::{Error, HttpClient, HttpClientOptions, RetryOptions};
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

/// A client with near-zero backoff so retry tests run fast.
fn fast_retry(server_uri: String, retries: u32) -> HttpClient {
    HttpClient::new(HttpClientOptions {
        base_url: server_uri,
        retry: RetryOptions {
            retries,
            base_delay: Duration::from_millis(1),
            max_delay: Duration::from_millis(2),
            ..Default::default()
        },
        ..Default::default()
    })
}

#[tokio::test]
async fn retries_idempotent_get_on_503_then_succeeds() {
    let server = MockServer::start().await;
    // The first two attempts get a 503; wiremock then falls through to the 200.
    Mock::given(method("GET"))
        .and(path("/thing"))
        .respond_with(ResponseTemplate::new(503))
        .up_to_n_times(2)
        .expect(2)
        .with_priority(1)
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/thing"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({"ok": true})))
        .expect(1)
        .mount(&server)
        .await;

    let http = fast_retry(server.uri(), 2);
    let value: serde_json::Value = http.get("/thing", &[]).await.unwrap();
    assert_eq!(value["ok"], serde_json::json!(true));
}

#[tokio::test]
async fn gives_up_after_configured_retries() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/thing"))
        .respond_with(ResponseTemplate::new(500))
        .expect(3) // 1 initial attempt + 2 retries
        .mount(&server)
        .await;

    let http = fast_retry(server.uri(), 2);
    let result: Result<serde_json::Value, Error> = http.get("/thing", &[]).await;
    assert_eq!(result.unwrap_err().status(), Some(500));
}

#[tokio::test]
async fn does_not_retry_a_non_idempotent_write() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/thing"))
        .respond_with(ResponseTemplate::new(503))
        .expect(1) // a POST must not be auto-retried
        .mount(&server)
        .await;

    let http = fast_retry(server.uri(), 3);
    let result: Result<serde_json::Value, Error> =
        http.post("/thing", None::<&serde_json::Value>).await;
    assert_eq!(result.unwrap_err().status(), Some(503));
}

#[tokio::test]
async fn does_not_retry_a_non_transient_status() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/thing"))
        .respond_with(ResponseTemplate::new(404))
        .expect(1)
        .mount(&server)
        .await;

    let http = fast_retry(server.uri(), 3);
    let result: Result<serde_json::Value, Error> = http.get("/thing", &[]).await;
    assert_eq!(result.unwrap_err().status(), Some(404));
}

#[tokio::test]
async fn unreachable_backend_times_out_as_transport_error() {
    // Reserved TEST-NET-1 address that does not route — the connect attempt
    // hangs until the timeout fires.
    let http = HttpClient::new(HttpClientOptions {
        base_url: "http://192.0.2.1:9".to_string(),
        timeout: Some(Duration::from_millis(150)),
        retry: RetryOptions {
            retries: 0,
            ..Default::default()
        },
        ..Default::default()
    });

    let result: Result<serde_json::Value, Error> = http.get("/thing", &[]).await;
    let err = result.unwrap_err();
    // A connection-level failure is a typed transport error, not a panic.
    assert!(matches!(err, Error::Transport(_)), "got {err:?}");
}
