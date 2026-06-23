//! Groups API. Mirrors `sdk/typescript/src/api/groups.ts`.

use rand::RngCore as _;
use serde::{Deserialize, Serialize};

use crate::error::Result;
use crate::http::HttpClient;
use crate::types::{
    GroupCreateRequest, GroupInvite, GroupInviteCreateRequest, GroupInvitePreview,
    GroupJoinRequest, GroupMember, GroupMessageFanoutRequest, GroupMessageFanoutResponse,
    GroupMetadata, GroupQueryParams, GroupRevenueShareRequest, GroupRevenueShareResponse,
    GroupSubscriptionEnforceResponse, GroupSubscriptionRenewRequest,
};
use crate::util::encode;

/// Wrapper for the `{ groups: [...] }` list response.
#[derive(Debug, Clone, Serialize)]
pub struct GroupListResponse {
    pub groups: Vec<GroupMetadata>,
}

/// The raw list payload, where `groups` may be `null`.
#[derive(Deserialize)]
struct GroupListPayload {
    groups: Option<Vec<GroupMetadata>>,
}

/// Wrapper for the `{ invites: [...] }` response.
pub struct GroupInvitesResponse {
    pub invites: Vec<GroupInvite>,
}

/// The raw invites payload, where `invites` may be `null`.
#[derive(Deserialize)]
struct GroupInvitesPayload {
    invites: Option<Vec<GroupInvite>>,
}

/// Wrapper for the `{ members: [...] }` response.
#[derive(Debug, Clone, Deserialize)]
pub struct GroupMembersResponse {
    pub members: Vec<GroupMember>,
}

#[derive(Clone)]
pub struct GroupsApi {
    http: HttpClient,
}

impl GroupsApi {
    pub(crate) fn new(http: HttpClient) -> Self {
        Self { http }
    }

    pub async fn list(&self, params: Option<&GroupQueryParams>) -> Result<GroupListResponse> {
        let query = groups_query(params);
        let result: GroupListPayload = self.http.get("/directory/groups", &query).await?;
        Ok(GroupListResponse {
            groups: result.groups.unwrap_or_default(),
        })
    }

    pub async fn get(&self, group_id: &str) -> Result<GroupMetadata> {
        let path = format!("/directory/groups/{}", encode(group_id));
        self.http.get(&path, &[]).await
    }

    pub async fn create(&self, request: GroupCreateRequest) -> Result<GroupMetadata> {
        let mut body = serde_json::to_value(&request)?;
        if let Some(obj) = body.as_object_mut() {
            if !obj.get("groupId").map(|v| v.is_string()).unwrap_or(false) {
                obj.insert(
                    "groupId".to_string(),
                    serde_json::Value::String(next_client_id("grp")),
                );
            }
        }
        if let Some(created_by) = request.created_by.as_deref() {
            self.http
                .post_directory_auth_as("/directory/groups", created_by, Some(&body))
                .await
        } else {
            self.http
                .post_directory_auth("/directory/groups", Some(&body))
                .await
        }
    }

    pub async fn members(&self, group_id: &str) -> Result<GroupMembersResponse> {
        let path = format!("/directory/groups/{}/members", encode(group_id));
        self.http.get(&path, &[]).await
    }

    pub async fn add_member(
        &self,
        group_id: &str,
        agent_id: &str,
        actor: Option<&str>,
    ) -> Result<GroupMember> {
        let path = format!("/directory/groups/{}/members", encode(group_id));
        let body = serde_json::json!({ "agentId": agent_id });
        if let Some(actor) = actor {
            self.http
                .post_directory_auth_as(&path, actor, Some(&body))
                .await
        } else {
            self.http.post_directory_auth(&path, Some(&body)).await
        }
    }

    pub async fn remove_member(
        &self,
        group_id: &str,
        agent_id: &str,
        actor: Option<&str>,
    ) -> Result<()> {
        let path = format!(
            "/directory/groups/{}/members/{}",
            encode(group_id),
            encode(agent_id)
        );
        let body = serde_json::json!({});
        if let Some(actor) = actor {
            self.http
                .delete_directory_auth_as(&path, actor, Some(&body))
                .await
        } else {
            self.http.delete_directory_auth(&path, Some(&body)).await
        }
    }

    pub async fn join(
        &self,
        group_id: &str,
        request: Option<GroupJoinRequest>,
    ) -> Result<GroupMember> {
        let body = request.unwrap_or_default();
        let path = format!("/directory/groups/{}/join", encode(group_id));
        if let Some(agent_id) = body.agent_id.as_deref() {
            self.http
                .post_directory_auth_as(&path, agent_id, Some(&body))
                .await
        } else {
            self.http.post_directory_auth(&path, Some(&body)).await
        }
    }

    pub async fn approve_member(
        &self,
        group_id: &str,
        agent_id: &str,
        actor: Option<&str>,
    ) -> Result<GroupMember> {
        let path = format!(
            "/directory/groups/{}/members/{}/approve",
            encode(group_id),
            encode(agent_id)
        );
        let body = serde_json::json!({});
        if let Some(actor) = actor {
            self.http
                .post_directory_auth_as(&path, actor, Some(&body))
                .await
        } else {
            self.http.post_directory_auth(&path, Some(&body)).await
        }
    }

    pub async fn reject_member(
        &self,
        group_id: &str,
        agent_id: &str,
        actor: Option<&str>,
    ) -> Result<()> {
        let path = format!(
            "/directory/groups/{}/members/{}/reject",
            encode(group_id),
            encode(agent_id)
        );
        let body = serde_json::json!({});
        if let Some(actor) = actor {
            self.http
                .post_directory_auth_as(&path, actor, Some(&body))
                .await
        } else {
            self.http.post_directory_auth(&path, Some(&body)).await
        }
    }

    pub async fn renew_member_subscription(
        &self,
        group_id: &str,
        agent_id: &str,
        request: Option<GroupSubscriptionRenewRequest>,
    ) -> Result<GroupMember> {
        let path = format!(
            "/directory/groups/{}/members/{}/subscription/renew",
            encode(group_id),
            encode(agent_id)
        );
        let body = request.unwrap_or_default();
        self.http
            .post_directory_auth_as(&path, agent_id, Some(&body))
            .await
    }

    pub async fn set_revenue_shares(
        &self,
        group_id: &str,
        request: GroupRevenueShareRequest,
        actor: Option<&str>,
    ) -> Result<GroupRevenueShareResponse> {
        let path = format!("/directory/groups/{}/revenue-shares", encode(group_id));
        if let Some(actor) = actor {
            self.http
                .post_directory_auth_as(&path, actor, Some(&request))
                .await
        } else {
            self.http.post_directory_auth(&path, Some(&request)).await
        }
    }

    pub async fn enforce_subscriptions(
        &self,
        group_id: &str,
        request: Option<serde_json::Value>,
        actor: Option<&str>,
    ) -> Result<GroupSubscriptionEnforceResponse> {
        let path = format!(
            "/directory/groups/{}/subscriptions/enforce",
            encode(group_id)
        );
        let body = request.unwrap_or_else(|| serde_json::json!({}));
        if let Some(actor) = actor {
            self.http
                .post_directory_auth_as(&path, actor, Some(&body))
                .await
        } else {
            self.http.post_directory_auth(&path, Some(&body)).await
        }
    }

    pub async fn fanout_message(
        &self,
        group_id: &str,
        message: GroupMessageFanoutRequest,
    ) -> Result<GroupMessageFanoutResponse> {
        let path = format!("/directory/groups/{}/messages", encode(group_id));
        let actor = message.from.clone();
        self.http
            .post_directory_auth_as(&path, &actor, Some(&message))
            .await
    }

    /// Promote or demote an active member between "admin" and "member".
    /// Owner-signed (or `actor`).
    pub async fn set_member_role(
        &self,
        group_id: &str,
        agent_id: &str,
        role: &str,
        actor: Option<&str>,
    ) -> Result<GroupMember> {
        let path = format!(
            "/directory/groups/{}/members/{}/role",
            encode(group_id),
            encode(agent_id)
        );
        let body = serde_json::json!({ "role": role });
        if let Some(actor) = actor {
            self.http
                .post_directory_auth_as(&path, actor, Some(&body))
                .await
        } else {
            self.http.post_directory_auth(&path, Some(&body)).await
        }
    }

    /// Issue (or rotate) the acting admin's invite link for a group.
    pub async fn create_invite(
        &self,
        group_id: &str,
        actor: &str,
        request: Option<GroupInviteCreateRequest>,
    ) -> Result<GroupInvite> {
        let path = format!("/directory/groups/{}/invites", encode(group_id));
        let body = request.unwrap_or_default();
        self.http
            .post_directory_auth_as(&path, actor, Some(&body))
            .await
    }

    /// List the active invites for a group (admin-signed).
    pub async fn list_invites(&self, group_id: &str, actor: &str) -> Result<GroupInvitesResponse> {
        let path = format!("/directory/groups/{}/invites", encode(group_id));
        let result: GroupInvitesPayload =
            self.http.get_directory_auth_as(&path, actor, &[]).await?;
        Ok(GroupInvitesResponse {
            invites: result.invites.unwrap_or_default(),
        })
    }

    /// Public preview of the group behind a valid invite token (no auth).
    pub async fn preview_invite(&self, group_id: &str, token: &str) -> Result<GroupInvitePreview> {
        let path = format!(
            "/directory/groups/{}/invites/{}",
            encode(group_id),
            encode(token)
        );
        self.http.get(&path, &[]).await
    }

    /// Revoke an invite token (admin-signed).
    pub async fn revoke_invite(&self, group_id: &str, token: &str, actor: &str) -> Result<()> {
        let path = format!(
            "/directory/groups/{}/invites/{}",
            encode(group_id),
            encode(token)
        );
        let body = serde_json::json!({});
        self.http
            .delete_directory_auth_as(&path, actor, Some(&body))
            .await
    }

    /// Redeem an invite token, joining the group regardless of policy.
    pub async fn redeem_invite(
        &self,
        group_id: &str,
        token: &str,
        agent_id: &str,
    ) -> Result<GroupMember> {
        let path = format!(
            "/directory/groups/{}/invites/{}/redeem",
            encode(group_id),
            encode(token)
        );
        let body = serde_json::json!({ "agentId": agent_id });
        self.http
            .post_directory_auth_as(&path, agent_id, Some(&body))
            .await
    }
}

/// Build the query vector for `list`, mirroring the TS object-to-query encoding.
fn groups_query(params: Option<&GroupQueryParams>) -> Vec<(String, String)> {
    let mut q: Vec<(String, String)> = Vec::new();
    let Some(p) = params else {
        return q;
    };
    if let Some(v) = &p.q {
        q.push(("q".into(), v.clone()));
    }
    if let Some(v) = &p.tag {
        q.push(("tag".into(), v.clone()));
    }
    if let Some(tags) = &p.tags {
        for t in tags {
            q.push(("tags".into(), t.clone()));
        }
    }
    if let Some(v) = &p.membership_policy {
        q.push(("membershipPolicy".into(), v.clone()));
    }
    if let Some(v) = p.has_payment_policy {
        q.push(("hasPaymentPolicy".into(), v.to_string()));
    }
    if let Some(v) = p.min_members {
        q.push(("minMembers".into(), v.to_string()));
    }
    if let Some(v) = p.max_members {
        q.push(("maxMembers".into(), v.to_string()));
    }
    if let Some(v) = p.limit {
        q.push(("limit".into(), v.to_string()));
    }
    if let Some(v) = &p.member {
        q.push(("member".into(), v.clone()));
    }
    q
}

/// Mirror the TS `nextClientId`: `<prefix>_<base36(now-ms)>_<12 hex>`.
fn next_client_id(prefix: &str) -> String {
    let mut random = [0u8; 6];
    rand::rngs::OsRng.fill_bytes(&mut random);
    let suffix: String = random.iter().map(|b| format!("{b:02x}")).collect();
    let millis = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("{prefix}_{}_{suffix}", to_base36(millis))
}

/// Encode a number in lower-case base36, matching JS `Number.toString(36)`.
fn to_base36(mut n: u128) -> String {
    if n == 0 {
        return "0".to_string();
    }
    const DIGITS: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    let mut buf = Vec::new();
    while n > 0 {
        buf.push(DIGITS[(n % 36) as usize]);
        n /= 36;
    }
    buf.reverse();
    String::from_utf8(buf).expect("base36 digits are ascii")
}
