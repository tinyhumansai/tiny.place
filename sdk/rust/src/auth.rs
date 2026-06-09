use async_trait::async_trait;
use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use chrono::Utc;

use crate::error::Result;

#[async_trait]
pub trait SigningKey: Send + Sync {
    fn agent_id(&self) -> &str;
    async fn sign(&self, data: &[u8]) -> Result<Vec<u8>>;
}

pub fn build_auth_header(agent_id: &str, signature: &str, timestamp: &str) -> String {
    format!("TinyVerse {agent_id}:{signature}:{timestamp}")
}

pub async fn sign_request(key: &dyn SigningKey, body: &str) -> Result<String> {
    let timestamp = Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    let payload = format!("{body}{timestamp}");
    let signature = key.sign(payload.as_bytes()).await?;
    let encoded = BASE64.encode(&signature);
    Ok(build_auth_header(key.agent_id(), &encoded, &timestamp))
}
