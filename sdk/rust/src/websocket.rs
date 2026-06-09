use std::sync::Arc;

use futures_util::{SinkExt, StreamExt};
use tokio::sync::mpsc;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;

use crate::auth::{SigningKey, sign_request};
use crate::error::{Result, TinyVerseError};

#[derive(Debug, Clone)]
pub enum WebSocketEvent {
    Open,
    Message(serde_json::Value),
    Close,
    Error(String),
}

pub struct TinyVerseWebSocketOptions {
    pub url: String,
    pub signing_key: Option<Arc<dyn SigningKey>>,
    pub reconnect: bool,
    pub reconnect_interval_ms: u64,
    pub max_reconnect_attempts: u32,
}

impl Default for TinyVerseWebSocketOptions {
    fn default() -> Self {
        Self {
            url: String::new(),
            signing_key: None,
            reconnect: true,
            reconnect_interval_ms: 3000,
            max_reconnect_attempts: 10,
        }
    }
}

pub struct TinyVerseWebSocket {
    options: TinyVerseWebSocketOptions,
    send_tx: Option<mpsc::UnboundedSender<String>>,
    shutdown_tx: Option<mpsc::Sender<()>>,
}

impl TinyVerseWebSocket {
    pub fn new(options: TinyVerseWebSocketOptions) -> Self {
        Self {
            options,
            send_tx: None,
            shutdown_tx: None,
        }
    }

    pub async fn connect(&mut self) -> Result<mpsc::UnboundedReceiver<WebSocketEvent>> {
        let (event_tx, event_rx) = mpsc::unbounded_channel();
        let (send_tx, mut send_rx) = mpsc::unbounded_channel::<String>();
        let (shutdown_tx, mut shutdown_rx) = mpsc::channel::<()>(1);

        self.send_tx = Some(send_tx);
        self.shutdown_tx = Some(shutdown_tx);

        let mut ws_url = self.options.url.clone();
        if let Some(ref key) = self.options.signing_key {
            let auth = sign_request(key.as_ref(), "").await?;
            let encoded = urlencoding::encode(&auth);
            let separator = if ws_url.contains('?') { "&" } else { "?" };
            ws_url = format!("{ws_url}{separator}authorization={encoded}");
        }

        let reconnect = self.options.reconnect;
        let reconnect_interval = self.options.reconnect_interval_ms;
        let max_attempts = self.options.max_reconnect_attempts;
        let signing_key = self.options.signing_key.clone();
        let base_url = self.options.url.clone();

        tokio::spawn(async move {
            let mut reconnect_count = 0u32;
            let mut current_url = ws_url;

            loop {
                let connect_result = connect_async(&current_url).await;
                match connect_result {
                    Ok((ws_stream, _)) => {
                        reconnect_count = 0;
                        let _ = event_tx.send(WebSocketEvent::Open);

                        let (mut write, mut read) = ws_stream.split();

                        loop {
                            tokio::select! {
                                msg = read.next() => {
                                    match msg {
                                        Some(Ok(Message::Text(text))) => {
                                            match serde_json::from_str(&text) {
                                                Ok(val) => { let _ = event_tx.send(WebSocketEvent::Message(val)); }
                                                Err(_) => {
                                                    let _ = event_tx.send(WebSocketEvent::Message(
                                                        serde_json::Value::String(text.to_string()),
                                                    ));
                                                }
                                            }
                                        }
                                        Some(Ok(Message::Close(_))) | None => {
                                            let _ = event_tx.send(WebSocketEvent::Close);
                                            break;
                                        }
                                        Some(Err(e)) => {
                                            let _ = event_tx.send(WebSocketEvent::Error(e.to_string()));
                                            break;
                                        }
                                        _ => {}
                                    }
                                }
                                Some(data) = send_rx.recv() => {
                                    let _ = write.send(Message::Text(data.into())).await;
                                }
                                _ = shutdown_rx.recv() => {
                                    let _ = write.send(Message::Close(None)).await;
                                    let _ = event_tx.send(WebSocketEvent::Close);
                                    return;
                                }
                            }
                        }
                    }
                    Err(e) => {
                        let _ = event_tx.send(WebSocketEvent::Error(e.to_string()));
                    }
                }

                if !reconnect || reconnect_count >= max_attempts {
                    return;
                }

                reconnect_count += 1;
                tokio::time::sleep(tokio::time::Duration::from_millis(reconnect_interval)).await;

                if let Some(ref key) = signing_key {
                    if let Ok(auth) = sign_request(key.as_ref(), "").await {
                        let encoded = urlencoding::encode(&auth);
                        let separator = if base_url.contains('?') { "&" } else { "?" };
                        current_url =
                            format!("{base_url}{separator}authorization={encoded}");
                    }
                }
            }
        });

        Ok(event_rx)
    }

    pub fn send(&self, data: &serde_json::Value) -> Result<()> {
        let json = serde_json::to_string(data)?;
        if let Some(ref tx) = self.send_tx {
            tx.send(json)
                .map_err(|e| TinyVerseError::WebSocket(e.to_string()))?;
        }
        Ok(())
    }

    pub fn close(&mut self) {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.try_send(());
        }
        self.send_tx = None;
    }
}
