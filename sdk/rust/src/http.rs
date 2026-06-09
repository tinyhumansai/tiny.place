use std::sync::Arc;

use reqwest::Client;
use serde::de::DeserializeOwned;
use serde::Serialize;
use url::form_urlencoded;

use crate::auth::{SigningKey, sign_request};
use crate::error::{Result, TinyVerseError};

pub struct HttpClient {
    base_url: String,
    signing_key: Option<Arc<dyn SigningKey>>,
    client: Client,
}

fn build_query(params: &serde_json::Value) -> String {
    let obj = match params.as_object() {
        Some(o) => o,
        None => return String::new(),
    };

    let mut serializer = form_urlencoded::Serializer::new(String::new());
    let mut has_entries = false;

    for (key, value) in obj {
        if value.is_null() {
            continue;
        }
        if let Some(arr) = value.as_array() {
            for item in arr {
                let s = match item {
                    serde_json::Value::String(s) => s.clone(),
                    other => other.to_string(),
                };
                serializer.append_pair(key, &s);
                has_entries = true;
            }
        } else {
            let s = match value {
                serde_json::Value::String(s) => s.clone(),
                serde_json::Value::Bool(b) => b.to_string(),
                serde_json::Value::Number(n) => n.to_string(),
                other => other.to_string(),
            };
            serializer.append_pair(key, &s);
            has_entries = true;
        }
    }

    if !has_entries {
        String::new()
    } else {
        format!("?{}", serializer.finish())
    }
}

impl HttpClient {
    pub fn new(
        base_url: &str,
        signing_key: Option<Arc<dyn SigningKey>>,
        client: Option<Client>,
    ) -> Self {
        Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            signing_key,
            client: client.unwrap_or_default(),
        }
    }

    async fn request<T: DeserializeOwned>(
        &self,
        method: reqwest::Method,
        path: &str,
        body: Option<&serde_json::Value>,
        query: Option<&serde_json::Value>,
        signed: bool,
    ) -> Result<T> {
        let query_string = query.map(build_query).unwrap_or_default();
        let url = format!("{}{path}{query_string}", self.base_url);

        let body_str = match body {
            Some(b) => serde_json::to_string(b)?,
            None => String::new(),
        };

        let mut builder = self
            .client
            .request(method, &url)
            .header("Content-Type", "application/json");

        if signed {
            if let Some(ref key) = self.signing_key {
                let auth = sign_request(key.as_ref(), &body_str).await?;
                builder = builder.header("Authorization", auth);
            }
        }

        if !body_str.is_empty() {
            builder = builder.body(body_str);
        }

        let response = builder.send().await?;

        if !response.status().is_success() {
            let status = response.status().as_u16();
            let error_body = response.text().await.unwrap_or_default();
            return Err(TinyVerseError::Http {
                status,
                body: error_body,
            });
        }

        if response.status() == reqwest::StatusCode::NO_CONTENT {
            return serde_json::from_value(serde_json::Value::Null).map_err(Into::into);
        }

        let text = response.text().await?;
        serde_json::from_str(&text).map_err(Into::into)
    }

    pub async fn get<T: DeserializeOwned>(
        &self,
        path: &str,
        query: Option<&serde_json::Value>,
    ) -> Result<T> {
        self.request(reqwest::Method::GET, path, None, query, false)
            .await
    }

    pub async fn get_auth<T: DeserializeOwned>(
        &self,
        path: &str,
        query: Option<&serde_json::Value>,
    ) -> Result<T> {
        self.request(reqwest::Method::GET, path, None, query, true)
            .await
    }

    pub async fn post<T: DeserializeOwned>(
        &self,
        path: &str,
        body: Option<&serde_json::Value>,
    ) -> Result<T> {
        self.request(reqwest::Method::POST, path, body, None, true)
            .await
    }

    pub async fn put<T: DeserializeOwned>(
        &self,
        path: &str,
        body: Option<&serde_json::Value>,
    ) -> Result<T> {
        self.request(reqwest::Method::PUT, path, body, None, true)
            .await
    }

    pub async fn delete<T: DeserializeOwned>(
        &self,
        path: &str,
        body: Option<&serde_json::Value>,
    ) -> Result<T> {
        self.request(reqwest::Method::DELETE, path, body, None, true)
            .await
    }

    pub async fn post_public<T: DeserializeOwned>(
        &self,
        path: &str,
        body: Option<&serde_json::Value>,
    ) -> Result<T> {
        self.request(reqwest::Method::POST, path, body, None, false)
            .await
    }

    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    pub fn signing_key(&self) -> Option<&Arc<dyn SigningKey>> {
        self.signing_key.as_ref()
    }
}

pub fn to_query<T: Serialize>(params: &T) -> Result<serde_json::Value> {
    serde_json::to_value(params).map_err(Into::into)
}

pub fn to_body<T: Serialize>(body: &T) -> Result<serde_json::Value> {
    serde_json::to_value(body).map_err(Into::into)
}
