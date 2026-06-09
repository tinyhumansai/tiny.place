use std::sync::Arc;

use serde::{Deserialize, Serialize};

use crate::error::Result;
use crate::http::{HttpClient, to_body, to_query};
use crate::types::{GroupCreateRequest, GroupMember, GroupMetadata, GroupQueryParams};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupListResponse {
    pub groups: Vec<GroupMetadata>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupMemberListResponse {
    pub members: Vec<GroupMember>,
}

pub struct GroupsApi {
    http: Arc<HttpClient>,
}

impl GroupsApi {
    pub fn new(http: Arc<HttpClient>) -> Self {
        Self { http }
    }

    pub async fn list(&self, params: Option<&GroupQueryParams>) -> Result<GroupListResponse> {
        let query = params.map(to_query).transpose()?;
        self.http.get("/directory/groups", query.as_ref()).await
    }

    pub async fn get(&self, group_id: &str) -> Result<GroupMetadata> {
        let path = format!("/directory/groups/{}", urlencoding::encode(group_id));
        self.http.get(&path, None).await
    }

    pub async fn create(&self, request: &GroupCreateRequest) -> Result<GroupMetadata> {
        self.http
            .post("/directory/groups", Some(&to_body(request)?))
            .await
    }

    pub async fn members(&self, group_id: &str) -> Result<GroupMemberListResponse> {
        let path = format!(
            "/directory/groups/{}/members",
            urlencoding::encode(group_id)
        );
        self.http.get(&path, None).await
    }

    pub async fn join(&self, group_id: &str) -> Result<GroupMember> {
        let path = format!(
            "/directory/groups/{}/join",
            urlencoding::encode(group_id)
        );
        self.http.post(&path, None).await
    }
}
