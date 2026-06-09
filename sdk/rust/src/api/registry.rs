use std::sync::Arc;

use crate::error::Result;
use crate::http::{HttpClient, to_body};
use crate::types::{
    AvailabilityResponse, Identity, IdentityClaimRequest, IdentityExport, IdentityProfileUpdate,
    LedgerTransaction, ProfileVisibilityUpdate, RenewalRequest, Subname, SubnameCreateRequest,
};

pub struct RegistryApi {
    http: Arc<HttpClient>,
}

impl RegistryApi {
    pub fn new(http: Arc<HttpClient>) -> Self {
        Self { http }
    }

    pub async fn register(&self, identity: &Identity) -> Result<Identity> {
        self.http
            .post("/registry/names", Some(&to_body(identity)?))
            .await
    }

    pub async fn get(&self, name: &str) -> Result<AvailabilityResponse> {
        let path = format!("/registry/names/{}", urlencoding::encode(name));
        self.http.get(&path, None).await
    }

    pub async fn export(&self, name: &str) -> Result<IdentityExport> {
        let path = format!("/registry/names/{}/export", urlencoding::encode(name));
        self.http.get(&path, None).await
    }

    pub async fn update_profile(
        &self,
        name: &str,
        update: &IdentityProfileUpdate,
    ) -> Result<Identity> {
        let path = format!("/registry/names/{}/profile", urlencoding::encode(name));
        self.http.put(&path, Some(&to_body(update)?)).await
    }

    pub async fn update_profile_visibility(
        &self,
        name: &str,
        update: &ProfileVisibilityUpdate,
    ) -> Result<Identity> {
        let path = format!(
            "/registry/names/{}/profile-visibility",
            urlencoding::encode(name)
        );
        self.http.put(&path, Some(&to_body(update)?)).await
    }

    pub async fn renew(
        &self,
        name: &str,
        request: &RenewalRequest,
    ) -> Result<LedgerTransaction> {
        let path = format!("/registry/names/{}/renew", urlencoding::encode(name));
        self.http.post(&path, Some(&to_body(request)?)).await
    }

    pub async fn claim(
        &self,
        name: &str,
        request: &IdentityClaimRequest,
    ) -> Result<LedgerTransaction> {
        let path = format!("/registry/names/{}/claim", urlencoding::encode(name));
        self.http.post(&path, Some(&to_body(request)?)).await
    }

    pub async fn create_subname(
        &self,
        name: &str,
        request: &SubnameCreateRequest,
    ) -> Result<Subname> {
        let path = format!("/registry/names/{}/subnames", urlencoding::encode(name));
        self.http.post(&path, Some(&to_body(request)?)).await
    }

    pub async fn delete_subname(&self, name: &str, subname: &str) -> Result<()> {
        let path = format!(
            "/registry/names/{}/subnames/{}",
            urlencoding::encode(name),
            urlencoding::encode(subname)
        );
        self.http.delete(&path, None).await
    }
}
