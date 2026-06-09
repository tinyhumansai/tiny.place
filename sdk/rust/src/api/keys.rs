use std::sync::Arc;

use crate::error::Result;
use crate::http::{HttpClient, to_body};
use crate::types::{KeyBundle, PreKeysRequest, SignedPreKeyRequest};

pub struct KeysApi {
    http: Arc<HttpClient>,
}

impl KeysApi {
    pub fn new(http: Arc<HttpClient>) -> Self {
        Self { http }
    }

    pub async fn get_bundle(&self, agent_id: &str) -> Result<KeyBundle> {
        let path = format!("/keys/{}/bundle", urlencoding::encode(agent_id));
        self.http.get_auth(&path, None).await
    }

    pub async fn upload_pre_keys(
        &self,
        agent_id: &str,
        request: &PreKeysRequest,
    ) -> Result<()> {
        let path = format!("/keys/{}/prekeys", urlencoding::encode(agent_id));
        self.http.put(&path, Some(&to_body(request)?)).await
    }

    pub async fn rotate_signed_pre_key(
        &self,
        agent_id: &str,
        request: &SignedPreKeyRequest,
    ) -> Result<()> {
        let path = format!("/keys/{}/signed-prekey", urlencoding::encode(agent_id));
        self.http.put(&path, Some(&to_body(request)?)).await
    }
}
