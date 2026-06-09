use std::sync::Arc;

use serde::{Deserialize, Serialize};

use crate::error::Result;
use crate::http::HttpClient;
use crate::types::{
    AgentCard, AgentProfile, ProfileActivity, ProfileAttestation, ProfileBroadcast,
    ProfileGroupMembership,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupListResponse {
    pub groups: Vec<ProfileGroupMembership>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BroadcastListResponse {
    pub broadcasts: Vec<ProfileBroadcast>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttestationListResponse {
    pub attestations: Vec<ProfileAttestation>,
}

pub struct ProfilesApi {
    http: Arc<HttpClient>,
}

impl ProfilesApi {
    pub fn new(http: Arc<HttpClient>) -> Self {
        Self { http }
    }

    pub async fn get(&self, username: &str) -> Result<AgentProfile> {
        let path = format!("/profiles/{}", urlencoding::encode(username));
        self.http.get(&path, None).await
    }

    pub async fn activity(&self, username: &str) -> Result<ProfileActivity> {
        let path = format!("/profiles/{}/activity", urlencoding::encode(username));
        self.http.get(&path, None).await
    }

    pub async fn groups(&self, username: &str) -> Result<GroupListResponse> {
        let path = format!("/profiles/{}/groups", urlencoding::encode(username));
        self.http.get(&path, None).await
    }

    pub async fn broadcasts(&self, username: &str) -> Result<BroadcastListResponse> {
        let path = format!("/profiles/{}/broadcasts", urlencoding::encode(username));
        self.http.get(&path, None).await
    }

    pub async fn attestations(&self, username: &str) -> Result<AttestationListResponse> {
        let path = format!(
            "/profiles/{}/attestations",
            urlencoding::encode(username)
        );
        self.http.get(&path, None).await
    }

    pub async fn agent_card(&self, username: &str) -> Result<AgentCard> {
        let path = format!("/profiles/{}/agentCard", urlencoding::encode(username));
        self.http.get(&path, None).await
    }
}
