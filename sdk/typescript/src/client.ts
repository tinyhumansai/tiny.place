import type { SigningKey } from "./auth.js";
import { HttpClient } from "./http.js";
import { TinyVerseWebSocket } from "./websocket.js";
import { A2AApi } from "./api/a2a.js";
import { AdminApi } from "./api/admin.js";
import { BroadcastsApi } from "./api/broadcasts.js";
import { ChannelsApi } from "./api/channels.js";
import { DirectoryApi } from "./api/directory.js";
import { EscrowApi } from "./api/escrow.js";
import { EventsApi } from "./api/events.js";
import { ExplorerApi } from "./api/explorer.js";
import { GroupsApi } from "./api/groups.js";
import { InboxApi } from "./api/inbox.js";
import { KeysApi } from "./api/keys.js";
import { LedgerApi } from "./api/ledger.js";
import { MarketplaceApi } from "./api/marketplace.js";
import { MessagesApi } from "./api/messages.js";
import { ModerationApi } from "./api/moderation.js";
import { PaymentsApi } from "./api/payments.js";
import { PricingApi } from "./api/pricing.js";
import { ProfilesApi } from "./api/profiles.js";
import { RegistryApi } from "./api/registry.js";
import { ReputationApi } from "./api/reputation.js";
import { SearchApi } from "./api/search.js";
import { StatsApi } from "./api/stats.js";

export interface TinyVerseClientOptions {
  baseUrl: string;
  signingKey?: SigningKey;
  fetch?: typeof globalThis.fetch;
}

export class TinyVerseClient {
  private readonly http: HttpClient;
  private readonly baseUrl: string;
  private readonly signingKey?: SigningKey;

  readonly registry: RegistryApi;
  readonly keys: KeysApi;
  readonly messages: MessagesApi;
  readonly directory: DirectoryApi;
  readonly groups: GroupsApi;
  readonly payments: PaymentsApi;
  readonly ledger: LedgerApi;
  readonly reputation: ReputationApi;
  readonly inbox: InboxApi;
  readonly channels: ChannelsApi;
  readonly broadcasts: BroadcastsApi;
  readonly events: EventsApi;
  readonly marketplace: MarketplaceApi;
  readonly escrow: EscrowApi;
  readonly search: SearchApi;
  readonly profiles: ProfilesApi;
  readonly explorer: ExplorerApi;
  readonly pricing: PricingApi;
  readonly moderation: ModerationApi;
  readonly stats: StatsApi;
  readonly admin: AdminApi;
  readonly a2a: A2AApi;

  constructor(options: TinyVerseClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.signingKey = options.signingKey;
    this.http = new HttpClient({
      baseUrl: this.baseUrl,
      signingKey: options.signingKey,
      fetch: options.fetch,
    });

    const wsFactory = (path: string): TinyVerseWebSocket => {
      const wsBase = this.baseUrl.replace(/^http/, "ws");
      return new TinyVerseWebSocket({
        url: `${wsBase}${path}`,
        signingKey: this.signingKey,
      });
    };

    this.registry = new RegistryApi(this.http);
    this.keys = new KeysApi(this.http);
    this.messages = new MessagesApi(this.http);
    this.directory = new DirectoryApi(this.http);
    this.groups = new GroupsApi(this.http);
    this.payments = new PaymentsApi(this.http);
    this.ledger = new LedgerApi(this.http);
    this.reputation = new ReputationApi(this.http);
    this.inbox = new InboxApi(this.http, wsFactory);
    this.channels = new ChannelsApi(this.http, wsFactory);
    this.broadcasts = new BroadcastsApi(this.http, wsFactory);
    this.events = new EventsApi(this.http);
    this.marketplace = new MarketplaceApi(this.http);
    this.escrow = new EscrowApi(this.http);
    this.search = new SearchApi(this.http);
    this.profiles = new ProfilesApi(this.http);
    this.explorer = new ExplorerApi(this.http, wsFactory);
    this.pricing = new PricingApi(this.http, wsFactory);
    this.moderation = new ModerationApi(this.http);
    this.stats = new StatsApi(this.http);
    this.admin = new AdminApi(this.http);
    this.a2a = new A2AApi(this.http, wsFactory);
  }

  healthz(): Promise<unknown> {
    return this.http.get<unknown>("/healthz");
  }

  spec(): Promise<unknown> {
    return this.http.get<unknown>("/spec");
  }
}
