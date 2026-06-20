//! The top-level [`TinyPlaceClient`]. Mirrors `sdk/typescript/src/client.ts`:
//! constructs the shared [`HttpClient`] and one handle per API namespace.

use std::sync::Arc;

use crate::auth::AdminSigningOptions;
use crate::error::Result;
use crate::http::{AuthInvalidHook, HttpClient, HttpClientOptions};
use crate::signer::Signer;

use crate::api::a2a::A2AApi;
use crate::api::activity::ActivityApi;
use crate::api::admin::AdminApi;
use crate::api::artifacts::ArtifactsApi;
use crate::api::bounties::BountiesApi;
use crate::api::broadcasts::BroadcastsApi;
use crate::api::channels::ChannelsApi;
use crate::api::conversations::ConversationsApi;
use crate::api::directory::DirectoryApi;
use crate::api::docs::DocsApi;
use crate::api::escrow::EscrowApi;
use crate::api::events::EventsApi;
use crate::api::explorer::ExplorerApi;
use crate::api::feedback::FeedbackApi;
use crate::api::feeds::FeedsApi;
use crate::api::follows::FollowsApi;
use crate::api::graphql::GraphQLApi;
use crate::api::groups::GroupsApi;
use crate::api::inbox::InboxApi;
use crate::api::jobs::JobsApi;
use crate::api::keys::KeysApi;
use crate::api::ledger::LedgerApi;
use crate::api::lottery::LotteryApi;
use crate::api::marketplace::MarketplaceApi;
use crate::api::mcp::McpApi;
use crate::api::messages::MessagesApi;
use crate::api::moderation::ModerationApi;
use crate::api::payments::PaymentsApi;
use crate::api::pricing::PricingApi;
use crate::api::profiles::ProfilesApi;
use crate::api::registry::RegistryApi;
use crate::api::reputation::ReputationApi;
use crate::api::rooms::RoomsApi;
use crate::api::search::SearchApi;
use crate::api::solana::SolanaApi;
use crate::api::stats::StatsApi;
use crate::api::users::UsersApi;

/// Options for constructing a [`TinyPlaceClient`].
#[derive(Default)]
pub struct TinyPlaceClientOptions {
    /// Backend base URL, e.g. `https://staging-api.tiny.place`.
    pub base_url: String,
    /// Signer used for agent/directory-authenticated requests.
    pub signer: Option<Arc<dyn Signer>>,
    /// Signer configured as an operator/auditor in the backend admin key set.
    pub admin_signer: Option<Arc<dyn Signer>>,
    /// Admin actor/role bound into `TinyPlace-Admin` signatures.
    pub admin: AdminSigningOptions,
    /// Invoked when any request is rejected with 401/403.
    pub on_auth_invalid: Option<AuthInvalidHook>,
}

/// The tiny.place API client. Each public field is an API namespace; the client
/// is cheap to clone (the underlying HTTP client is `Arc`-backed).
#[derive(Clone)]
pub struct TinyPlaceClient {
    http: HttpClient,

    pub registry: RegistryApi,
    pub keys: KeysApi,
    pub messages: MessagesApi,
    pub mcp: McpApi,
    pub directory: DirectoryApi,
    pub groups: GroupsApi,
    pub graphql: GraphQLApi,
    pub payments: PaymentsApi,
    pub ledger: LedgerApi,
    pub activity: ActivityApi,
    pub reputation: ReputationApi,
    pub inbox: InboxApi,
    pub channels: ChannelsApi,
    pub conversations: ConversationsApi,
    pub broadcasts: BroadcastsApi,
    pub bounties: BountiesApi,
    pub events: EventsApi,
    pub marketplace: MarketplaceApi,
    pub escrow: EscrowApi,
    pub jobs: JobsApi,
    pub search: SearchApi,
    pub profiles: ProfilesApi,
    pub users: UsersApi,
    pub explorer: ExplorerApi,
    pub feedback: FeedbackApi,
    pub feeds: FeedsApi,
    pub follows: FollowsApi,
    pub pricing: PricingApi,
    pub solana: SolanaApi,
    pub moderation: ModerationApi,
    pub stats: StatsApi,
    pub admin: AdminApi,
    pub a2a: A2AApi,
    pub rooms: RoomsApi,
    pub lottery: LotteryApi,
    pub artifacts: ArtifactsApi,
    pub docs: DocsApi,
}

impl TinyPlaceClient {
    pub fn new(options: TinyPlaceClientOptions) -> Self {
        let http = HttpClient::new(HttpClientOptions {
            base_url: options.base_url,
            signer: options.signer,
            admin_signer: options.admin_signer,
            admin: options.admin,
            on_auth_invalid: options.on_auth_invalid,
        });

        Self {
            registry: RegistryApi::new(http.clone()),
            keys: KeysApi::new(http.clone()),
            messages: MessagesApi::new(http.clone()),
            mcp: McpApi::new(http.clone()),
            directory: DirectoryApi::new(http.clone()),
            groups: GroupsApi::new(http.clone()),
            graphql: GraphQLApi::new(http.clone()),
            payments: PaymentsApi::new(http.clone()),
            ledger: LedgerApi::new(http.clone()),
            activity: ActivityApi::new(http.clone()),
            reputation: ReputationApi::new(http.clone()),
            inbox: InboxApi::new(http.clone()),
            channels: ChannelsApi::new(http.clone()),
            conversations: ConversationsApi::new(http.clone()),
            broadcasts: BroadcastsApi::new(http.clone()),
            bounties: BountiesApi::new(http.clone()),
            events: EventsApi::new(http.clone()),
            marketplace: MarketplaceApi::new(http.clone()),
            escrow: EscrowApi::new(http.clone()),
            jobs: JobsApi::new(http.clone()),
            search: SearchApi::new(http.clone()),
            profiles: ProfilesApi::new(http.clone()),
            users: UsersApi::new(http.clone()),
            explorer: ExplorerApi::new(http.clone()),
            feedback: FeedbackApi::new(http.clone()),
            feeds: FeedsApi::new(http.clone()),
            follows: FollowsApi::new(http.clone()),
            pricing: PricingApi::new(http.clone()),
            solana: SolanaApi::new(http.clone()),
            moderation: ModerationApi::new(http.clone()),
            stats: StatsApi::new(http.clone()),
            admin: AdminApi::new(http.clone()),
            a2a: A2AApi::new(http.clone()),
            rooms: RoomsApi::new(http.clone()),
            lottery: LotteryApi::new(http.clone()),
            artifacts: ArtifactsApi::new(http.clone()),
            docs: DocsApi::new(http.clone()),
            http,
        }
    }

    /// The underlying HTTP client (for advanced/unwrapped calls).
    pub fn http(&self) -> &HttpClient {
        &self.http
    }

    /// `GET /healthz`.
    pub async fn healthz(&self) -> Result<serde_json::Value> {
        self.http.get("/healthz", &[]).await
    }

    /// `GET /spec`.
    pub async fn spec(&self) -> Result<serde_json::Value> {
        self.http.get("/spec", &[]).await
    }
}
