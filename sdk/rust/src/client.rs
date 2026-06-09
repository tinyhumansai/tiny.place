use std::sync::Arc;

use reqwest::Client;

use crate::api::a2a::A2AApi;
use crate::api::admin::AdminApi;
use crate::api::broadcasts::BroadcastsApi;
use crate::api::channels::ChannelsApi;
use crate::api::directory::DirectoryApi;
use crate::api::escrow::EscrowApi;
use crate::api::events::EventsApi;
use crate::api::explorer::ExplorerApi;
use crate::api::groups::GroupsApi;
use crate::api::inbox::InboxApi;
use crate::api::keys::KeysApi;
use crate::api::ledger::LedgerApi;
use crate::api::marketplace::MarketplaceApi;
use crate::api::messages::MessagesApi;
use crate::api::moderation::ModerationApi;
use crate::api::payments::PaymentsApi;
use crate::api::pricing::PricingApi;
use crate::api::profiles::ProfilesApi;
use crate::api::registry::RegistryApi;
use crate::api::reputation::ReputationApi;
use crate::api::search::SearchApi;
use crate::api::stats::StatsApi;
use crate::auth::SigningKey;
use crate::error::Result;
use crate::http::HttpClient;
use crate::websocket::{TinyVerseWebSocket, TinyVerseWebSocketOptions};

pub struct TinyVerseClientConfig {
    pub base_url: String,
    pub signing_key: Option<Arc<dyn SigningKey>>,
    pub client: Option<Client>,
}

pub struct TinyVerseClient {
    http: Arc<HttpClient>,
    pub registry: RegistryApi,
    pub keys: KeysApi,
    pub messages: MessagesApi,
    pub directory: DirectoryApi,
    pub groups: GroupsApi,
    pub payments: PaymentsApi,
    pub ledger: LedgerApi,
    pub reputation: ReputationApi,
    pub inbox: InboxApi,
    pub channels: ChannelsApi,
    pub broadcasts: BroadcastsApi,
    pub events: EventsApi,
    pub marketplace: MarketplaceApi,
    pub escrow: EscrowApi,
    pub search: SearchApi,
    pub profiles: ProfilesApi,
    pub explorer: ExplorerApi,
    pub pricing: PricingApi,
    pub moderation: ModerationApi,
    pub stats: StatsApi,
    pub admin: AdminApi,
    pub a2a: A2AApi,
}

impl TinyVerseClient {
    pub fn new(config: TinyVerseClientConfig) -> Self {
        let base_url = config.base_url.trim_end_matches('/').to_string();
        let signing_key = config.signing_key;

        let http = Arc::new(HttpClient::new(
            &base_url,
            signing_key.clone(),
            config.client,
        ));

        let ws_base = base_url.replacen("http", "ws", 1);
        let ws_signing_key = signing_key.clone();

        let ws_factory: Arc<dyn Fn(&str) -> TinyVerseWebSocket + Send + Sync> =
            Arc::new(move |path: &str| {
                let url = format!("{ws_base}{path}");
                TinyVerseWebSocket::new(TinyVerseWebSocketOptions {
                    url,
                    signing_key: ws_signing_key.clone(),
                    ..Default::default()
                })
            });

        let ws = Some(ws_factory.clone());

        Self {
            registry: RegistryApi::new(Arc::clone(&http)),
            keys: KeysApi::new(Arc::clone(&http)),
            messages: MessagesApi::new(Arc::clone(&http)),
            directory: DirectoryApi::new(Arc::clone(&http)),
            groups: GroupsApi::new(Arc::clone(&http)),
            payments: PaymentsApi::new(Arc::clone(&http)),
            ledger: LedgerApi::new(Arc::clone(&http)),
            reputation: ReputationApi::new(Arc::clone(&http)),
            inbox: InboxApi::new(Arc::clone(&http), ws.clone()),
            channels: ChannelsApi::new(Arc::clone(&http), ws.clone()),
            broadcasts: BroadcastsApi::new(Arc::clone(&http), ws.clone()),
            events: EventsApi::new(Arc::clone(&http)),
            marketplace: MarketplaceApi::new(Arc::clone(&http)),
            escrow: EscrowApi::new(Arc::clone(&http)),
            search: SearchApi::new(Arc::clone(&http)),
            profiles: ProfilesApi::new(Arc::clone(&http)),
            explorer: ExplorerApi::new(Arc::clone(&http), ws.clone()),
            pricing: PricingApi::new(Arc::clone(&http), ws.clone()),
            moderation: ModerationApi::new(Arc::clone(&http)),
            stats: StatsApi::new(Arc::clone(&http)),
            admin: AdminApi::new(Arc::clone(&http)),
            a2a: A2AApi::new(Arc::clone(&http), ws),
            http,
        }
    }

    pub async fn healthz(&self) -> Result<serde_json::Value> {
        self.http.get("/healthz", None).await
    }

    pub async fn spec(&self) -> Result<serde_json::Value> {
        self.http.get("/spec", None).await
    }
}
