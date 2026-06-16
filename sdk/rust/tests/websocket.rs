//! WebSocket streaming tests: signed-URL construction (public API) and a live
//! connect/recv/send/close round-trip against a local `tokio-tungstenite` server.

use std::sync::Arc;

use futures_util::{SinkExt as _, StreamExt as _};
use tinyplace::{LocalSigner, TinyPlaceClient, TinyPlaceClientOptions};
use tokio::net::TcpListener;
use tokio_tungstenite::tungstenite::Message;

fn client(base_url: &str, with_signer: bool) -> TinyPlaceClient {
    let signer = with_signer.then(|| {
        Arc::new(LocalSigner::from_seed(&[1u8; 32]).unwrap()) as Arc<dyn tinyplace::Signer>
    });
    TinyPlaceClient::new(TinyPlaceClientOptions {
        base_url: base_url.to_string(),
        signer,
        ..Default::default()
    })
}

#[tokio::test]
async fn ws_url_maps_https_to_wss() {
    let client = client("https://api.example.com", false);
    let url = client.inbox.stream().signed_url().await.unwrap();
    assert_eq!(url, "wss://api.example.com/inbox/stream");
}

#[tokio::test]
async fn ws_url_maps_http_to_ws() {
    let client = client("http://localhost:8080", false);
    let url = client.inbox.stream().signed_url().await.unwrap();
    assert_eq!(url, "ws://localhost:8080/inbox/stream");
}

#[tokio::test]
async fn ws_agent_auth_appends_authorization_param() {
    let client = client("https://api.example.com", true);
    let url = client.activity.stream(None).signed_url().await.unwrap();
    assert!(url.contains("authorization="), "got: {url}");
    assert!(!url.contains("X-TinyPlace-Signature="), "got: {url}");
}

#[tokio::test]
async fn ws_directory_auth_signs_query_params() {
    let client = client("https://api.example.com", true);
    let url = client.a2a.stream("@alice").signed_url().await.unwrap();
    assert!(url.contains("X-TinyPlace-Public-Key="), "got: {url}");
    assert!(url.contains("X-TinyPlace-Signature="), "got: {url}");
    assert!(url.contains("X-TinyPlace-Date="), "got: {url}");
    assert!(url.contains("X-TinyPlace-Nonce="), "got: {url}");
}

#[tokio::test]
async fn ws_no_signer_no_auth_params() {
    let client = client("https://api.example.com", false);
    let url = client.activity.stream(None).signed_url().await.unwrap();
    assert_eq!(url, "wss://api.example.com/activity/stream");
}

#[tokio::test]
async fn ws_stream_query_params_are_included() {
    let client = client("https://api.example.com", false);
    let url = client
        .channels
        .stream("c1", None, Some(50))
        .signed_url()
        .await
        .unwrap();
    assert!(url.starts_with("wss://api.example.com/channels/c1/stream?"));
    assert!(url.contains("limit=50"), "got: {url}");
}

#[tokio::test]
async fn ws_connect_recv_send_close_round_trip() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();

    let server = tokio::spawn(async move {
        let (tcp, _) = listener.accept().await.unwrap();
        let mut ws = tokio_tungstenite::accept_async(tcp).await.unwrap();
        ws.send(Message::Text("{\"type\":\"hello\",\"n\":1}".to_string()))
            .await
            .unwrap();
        // Echo back whatever the client sends, then close.
        if let Some(Ok(incoming)) = ws.next().await {
            if incoming.is_text() {
                ws.send(incoming).await.unwrap();
            }
        }
        let _ = ws.close(None).await;
    });

    let client = client(&format!("http://{addr}"), false);
    let mut conn = client.inbox.stream().connect().await.unwrap();

    let first = conn.recv().await.expect("a message").expect("valid json");
    assert_eq!(first["type"], "hello");
    assert_eq!(first["n"], 1);

    conn.send(&serde_json::json!({"ack": true})).await.unwrap();
    let echoed = conn.recv().await.expect("echo").expect("valid json");
    assert_eq!(echoed["ack"], true);

    conn.close().await.unwrap();
    server.await.unwrap();
}
