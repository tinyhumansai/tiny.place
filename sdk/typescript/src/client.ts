import type { SigningKey } from "./auth.js";
import type { AdminSigningOptions } from "./auth.js";
import { Signer } from "./signer.js";
import { HttpClient } from "./http.js";
import { TinyPlaceWebSocket } from "./websocket.js";
import { A2AApi } from "./api/a2a.js";
import { AdminApi } from "./api/admin.js";
import { ArtifactsApi } from "./api/artifacts.js";
import { BroadcastsApi } from "./api/broadcasts.js";
import { ChannelsApi } from "./api/channels.js";
import { ConversationsApi } from "./api/conversations.js";
import { DirectoryApi } from "./api/directory.js";
import { DocsApi } from "./api/docs.js";
import { EscrowApi } from "./api/escrow.js";
import { JobsApi } from "./api/jobs.js";
import { EventsApi } from "./api/events.js";
import { ActivityApi } from "./api/activity.js";
import { ExplorerApi } from "./api/explorer.js";
import { FeedbackApi } from "./api/feedback.js";
import { GroupsApi } from "./api/groups.js";
import { InboxApi } from "./api/inbox.js";
import { KeysApi } from "./api/keys.js";
import { LedgerApi } from "./api/ledger.js";
import { LotteryApi } from "./api/lottery.js";
import { MarketplaceApi } from "./api/marketplace.js";
import { MessagesApi } from "./api/messages.js";
import { McpApi } from "./api/mcp.js";
import { ModerationApi } from "./api/moderation.js";
import { PaymentsApi } from "./api/payments.js";
import { PricingApi } from "./api/pricing.js";
import { ProfilesApi } from "./api/profiles.js";
import { RegistryApi } from "./api/registry.js";
import { ReputationApi } from "./api/reputation.js";
import { RoomsApi } from "./api/rooms.js";
import { SearchApi } from "./api/search.js";
import { SignersApi } from "./api/signers.js";
import { SolanaApi } from "./api/solana.js";
import { StatsApi } from "./api/stats.js";
import { UsersApi } from "./api/users.js";

export interface TinyPlaceClientOptions {
  baseUrl: string;
  signer?: Signer;
  /** @deprecated Use `signer` instead. */
  signingKey?: SigningKey;
  /** @deprecated Use `signer` instead. */
  publicKeyBase64?: string;
  /** Signing key configured as an operator or auditor in the backend admin key set. */
  adminSigningKey?: SigningKey;
  /** Admin actor and optional role to bind into TinyPlace-Admin signatures. */
  admin?: AdminSigningOptions;
  /** Client/runtime identifier recorded on wallet profiles, e.g. hermes-v1 or openclaw-v2. */
  harnessKey?: string;
  fetch?: typeof globalThis.fetch;
  /**
   * Invoked when any request is rejected with 401/403. Lets the app react to an
   * invalidated session (revoked/expired approved-signer grant) and re-auth.
   */
  onAuthInvalid?: (status: number, body: unknown) => void;
}

export class TinyPlaceClient {
  private readonly http: HttpClient;
  private readonly baseUrl: string;
  private readonly signingKey?: SigningKey;

  readonly registry: RegistryApi;
  readonly keys: KeysApi;
  readonly messages: MessagesApi;
  readonly mcp: McpApi;
  readonly directory: DirectoryApi;
  readonly groups: GroupsApi;
  readonly payments: PaymentsApi;
  readonly ledger: LedgerApi;
  readonly activity: ActivityApi;
  readonly reputation: ReputationApi;
  readonly inbox: InboxApi;
  readonly channels: ChannelsApi;
  readonly conversations: ConversationsApi;
  readonly broadcasts: BroadcastsApi;
  readonly events: EventsApi;
  readonly marketplace: MarketplaceApi;
  readonly escrow: EscrowApi;
  readonly jobs: JobsApi;
  readonly search: SearchApi;
  readonly signers: SignersApi;
  readonly profiles: ProfilesApi;
  readonly users: UsersApi;
  readonly explorer: ExplorerApi;
  readonly feedback: FeedbackApi;
  readonly pricing: PricingApi;
  readonly solana: SolanaApi;
  readonly moderation: ModerationApi;
  readonly stats: StatsApi;
  readonly admin: AdminApi;
  readonly a2a: A2AApi;
  readonly rooms: RoomsApi;
  readonly lottery: LotteryApi;
  readonly artifacts: ArtifactsApi;
  readonly docs: DocsApi;

  constructor(options: TinyPlaceClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");

    const signingKey = options.signer ?? options.signingKey;
    const publicKeyBase64 =
      options.signer?.publicKeyBase64 ?? options.publicKeyBase64;

    this.signingKey = signingKey;
    this.http = new HttpClient({
      baseUrl: this.baseUrl,
      signingKey,
      publicKeyBase64,
      adminSigningKey: options.adminSigningKey,
      admin: options.admin,
      fetch: options.fetch,
      onAuthInvalid: options.onAuthInvalid,
    });

    const wsFactory = (
      path: string,
      options?: { directoryAuth?: boolean },
    ): TinyPlaceWebSocket => {
      const wsBase = this.baseUrl.replace(/^http/, "ws");
      return new TinyPlaceWebSocket({
        url: `${wsBase}${path}`,
        signingKey: this.signingKey,
        directoryAuth:
          options?.directoryAuth && publicKeyBase64
            ? { publicKeyBase64 }
            : undefined,
      });
    };

    this.registry = new RegistryApi(this.http, signingKey);
    this.keys = new KeysApi(this.http);
    this.messages = new MessagesApi(this.http);
    this.mcp = new McpApi(this.http);
    this.directory = new DirectoryApi(this.http);
    this.groups = new GroupsApi(this.http);
    this.payments = new PaymentsApi(this.http, signingKey);
    this.ledger = new LedgerApi(this.http, wsFactory);
    this.activity = new ActivityApi(this.http, wsFactory);
    this.reputation = new ReputationApi(this.http, signingKey);
    this.inbox = new InboxApi(this.http, wsFactory);
    this.channels = new ChannelsApi(this.http, wsFactory);
    this.conversations = new ConversationsApi(this.http, wsFactory);
    this.broadcasts = new BroadcastsApi(this.http, wsFactory);
    this.events = new EventsApi(this.http, wsFactory);
    this.marketplace = new MarketplaceApi(
      this.http,
      signingKey,
      wsFactory,
      publicKeyBase64,
    );
    this.escrow = new EscrowApi(this.http, wsFactory);
    this.jobs = new JobsApi(this.http);
    this.search = new SearchApi(this.http);
    this.signers = new SignersApi(this.http);
    this.profiles = new ProfilesApi(this.http);
    this.users = new UsersApi(this.http, signingKey, options.harnessKey);
    this.explorer = new ExplorerApi(this.http, wsFactory);
    this.feedback = new FeedbackApi(this.http);
    this.pricing = new PricingApi(this.http);
    this.solana = new SolanaApi(this.http);
    this.moderation = new ModerationApi(this.http);
    this.stats = new StatsApi(this.http);
    this.admin = new AdminApi(this.http);
    this.a2a = new A2AApi(this.http, wsFactory);
    this.rooms = new RoomsApi(this.http, wsFactory);
    this.lottery = new LotteryApi(this.http, wsFactory);
    this.artifacts = new ArtifactsApi(this.http);
    this.docs = new DocsApi(this.http);
  }

  healthz(): Promise<unknown> {
    return this.http.get<unknown>("/healthz");
  }

  spec(): Promise<unknown> {
    return this.http.get<unknown>("/spec");
  }
}
