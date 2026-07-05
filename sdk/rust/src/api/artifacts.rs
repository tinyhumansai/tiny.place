//! Compatibility wrapper for artifact endpoints used by OpenHuman.

use crate::error::Result;
use crate::http::HttpClient;
use crate::types::ArtifactQueryParams;
use crate::util::encode;

#[derive(Clone)]
pub struct ArtifactsApi {
    http: HttpClient,
}

impl ArtifactsApi {
    pub(crate) fn new(http: HttpClient) -> Self {
        Self { http }
    }

    pub async fn get(
        &self,
        artifact_id: &str,
        actor_id: Option<&str>,
    ) -> Result<serde_json::Value> {
        let query = actor_query(actor_id);
        self.http
            .get(&format!("/artifacts/{}", encode(artifact_id)), &query)
            .await
    }

    pub async fn list(
        &self,
        params: Option<&ArtifactQueryParams>,
        actor_id: Option<&str>,
    ) -> Result<serde_json::Value> {
        let mut query = Vec::new();
        if let Some(p) = params {
            push_opt(&mut query, "owner", p.owner.as_deref());
            push_opt(&mut query, "kind", p.kind.as_deref());
            push_i64(&mut query, "limit", p.limit);
            push_i64(&mut query, "offset", p.offset);
        }
        push_opt(&mut query, "actorId", actor_id);
        self.http.get("/artifacts", &query).await
    }
}

fn actor_query(actor_id: Option<&str>) -> Vec<(String, String)> {
    let mut query = Vec::new();
    push_opt(&mut query, "actorId", actor_id);
    query
}

fn push_opt(query: &mut Vec<(String, String)>, key: &str, value: Option<&str>) {
    if let Some(value) = value {
        query.push((key.to_string(), value.to_string()));
    }
}

fn push_i64(query: &mut Vec<(String, String)>, key: &str, value: Option<i64>) {
    if let Some(value) = value {
        query.push((key.to_string(), value.to_string()));
    }
}
