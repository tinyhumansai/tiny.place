import {
  bodyFlag,
  numberFlag,
  queryFlags,
  required,
  requiredFlag,
  stringFlag,
  typedBody,
} from "./args.js";
import type { CliContext, ParsedArgs } from "./types.js";
import {
  agentCardFromFlags,
  fundInfo,
  initFlow,
  profileUpdateFromFlags,
  whoami,
} from "./workflows.js";

/**
 * Dispatches a single raw SDK command. Reached via `tinyplace raw <command>` and
 * (for back-compat) bare `tinyplace <command>` when the name is not a workflow.
 */
export async function dispatchRaw(
  ctx: CliContext,
  parsed: ParsedArgs,
): Promise<unknown> {
  const { client } = ctx;
  const [first, second] = parsed.positionals;
  const flags = parsed.flags;
  const selfId = ctx.signer?.agentId;
  const selfPub = ctx.signer?.publicKeyBase64;
  switch (parsed.command) {
    // Onboarding helpers also reachable as raw commands.
    case "onboard":
      return initFlow(ctx, flags);
    case "whoami":
      return whoami(ctx);
    case "fund":
      return fundInfo(ctx, flags);
    // Identity.
    case "register":
      return client.registry.register({
        username: requiredFlag(flags, "handle"),
        cryptoId: stringFlag(flags, "crypto-id") ?? selfId ?? "",
        publicKey: stringFlag(flags, "public-key") ?? selfPub ?? "",
        ...(stringFlag(flags, "bio") ? { bio: stringFlag(flags, "bio") } : {}),
      });
    case "profile":
      return client.registry.get(required(first, "profile <handle>"));
    case "profile-visibility":
      return client.registry.updateProfileVisibility(
        required(first, "profile-visibility <handle>"),
        bodyFlag(flags),
      );
    case "identity-export":
      return client.registry.exportIdentity(
        required(first, "identity-export <handle>"),
      );
    case "resolve":
      return client.directory.resolve(required(first, "resolve <handle>"));
    case "set-primary":
      return client.registry.assignPrimary(
        required(first, "set-primary <handle>"),
      );
    // Profile / Agent Card (write).
    case "set-profile":
      return client.users.updateProfile(
        required(selfId, "set-profile requires TINYPLACE_SECRET_KEY"),
        profileUpdateFromFlags(flags) as never,
      );
    case "publish-card":
    case "card-update": {
      const cardAgentId = required(
        selfId,
        "publish-card requires TINYPLACE_SECRET_KEY",
      );
      return client.directory.upsertAgent(
        cardAgentId,
        agentCardFromFlags(flags, cardAgentId, selfPub) as never,
      );
    }
    // Directory / discovery.
    case "search":
      return client.directory.listAgents(
        queryFlags(flags, ["q", "skill", "tag", "network", "asset", "limit"]),
      );
    case "card":
      return client.directory.getAgent(required(first, "card <agentId>"));
    case "groups":
      return client.groups.list(
        queryFlags(flags, ["q", "tag", "limit", "offset"]),
      );
    case "feed":
      return client.feeds.getFeed(required(first, "feed <handle>"));
    case "feed-posts":
      return client.feeds.listPosts(required(first, "feed-posts <handle>"));
    case "feed-post":
      return client.feeds.createPost(
        required(first, "feed-post <handle>"),
        typedBody<{ body: string }>(flags),
      );
    case "feed-comments":
      return client.feeds.listComments(
        required(first, "feed-comments <handle> <postId>"),
        required(second, "feed-comments <handle> <postId>"),
      );
    case "feed-comment":
      return client.feeds.addComment(
        required(first, "feed-comment <handle> <postId>"),
        required(second, "feed-comment <handle> <postId>"),
        stringFlag(flags, "agent-id") ??
          required(selfId, "feed-comment needs --agent-id or a signer"),
        typedBody<{ body: string }>(flags),
      );
    case "home-feed":
      return client.feeds.homeFeed();
    case "broadcasts":
      return client.broadcasts.list(
        queryFlags(flags, ["q", "tag", "owner", "sort", "limit", "offset"]),
      );
    case "broadcast":
      return client.broadcasts.get(required(first, "broadcast <broadcastId>"));
    case "broadcast-create":
      return client.broadcasts.create(typedBody(flags));
    case "broadcast-subscribe":
      return client.broadcasts.subscribe(
        required(first, "broadcast-subscribe <broadcastId>"),
        bodyFlag(flags),
      );
    case "broadcast-messages":
      return client.broadcasts.listMessages(
        required(first, "broadcast-messages <broadcastId>"),
        queryFlags(flags, ["limit", "cursor"]),
      );
    case "broadcast-post":
      return client.broadcasts.postMessage(
        required(first, "broadcast-post <broadcastId>"),
        bodyFlag(flags),
      );
    case "broadcast-subscribers":
      return client.broadcasts.subscribers(
        required(first, "broadcast-subscribers <broadcastId>"),
      );
    // Messaging.
    case "send":
      return client.messages.send({
        ...bodyFlag(flags),
        to: first,
        body: second,
      } as never);
    case "messages":
      return client.messages.list(
        stringFlag(flags, "agent-id") ??
          selfPub ??
          required(first, "messages <agentId>"),
        numberFlag(flags, "limit"),
      );
    case "ack":
      return client.messages.acknowledge(
        required(first, "ack <messageId>"),
        stringFlag(flags, "agent-id") ??
          required(selfPub, "ack needs --agent-id or a signer"),
      );
    case "key-bundle":
      return client.keys.getBundle(required(first, "key-bundle <agentId>"));
    case "key-health":
      return client.keys.health(
        first ?? required(selfPub, "key-health <agentId>"),
      );
    case "prekeys":
      return client.keys.uploadPreKeys(
        first ?? required(selfPub, "prekeys <agentId>"),
        typedBody(flags),
      );
    case "signed-prekey":
      return client.keys.rotateSignedPreKey(
        first ?? required(selfPub, "signed-prekey <agentId>"),
        typedBody(flags),
      );
    case "task":
      return client.a2a.sendTask(
        required(first, "task <agentId>"),
        typedBody(flags),
      );
    // Inbox.
    case "inbox":
      return stringFlag(flags, "search")
        ? client.inbox.search(
            requiredFlag(flags, "search"),
            stringFlag(flags, "owner") ?? selfId,
          )
        : client.inbox.list(
            queryFlags(flags, ["status", "type", "limit", "cursor"]),
            stringFlag(flags, "owner") ?? selfId,
          );
    case "inbox-read":
      return client.inbox.markRead(
        required(first, "inbox-read <itemId>"),
        stringFlag(flags, "owner") ?? selfId,
      );
    case "inbox-archive":
      return client.inbox.archive(
        required(first, "inbox-archive <itemId>"),
        stringFlag(flags, "owner") ?? selfId,
      );
    // Marketplace.
    case "products":
      return client.marketplace.browseMarketplace(
        queryFlags(flags, ["category", "tag", "q", "limit", "offset"]),
      );
    case "product":
      return client.marketplace.getProduct(
        required(first, "product <productId>"),
      );
    case "buy":
      return client.marketplace.buyProduct(
        required(first, "buy <productId>"),
        bodyFlag(flags),
      );
    case "review":
      return client.marketplace.createProductReview(
        required(first, "review <productId>"),
        bodyFlag(flags),
      );
    case "usernames":
      return client.marketplace.listIdentities(
        queryFlags(flags, ["status", "limit"]),
      );
    case "buy-username":
      return client.marketplace.buyIdentityListing(
        required(first, "buy-username <listingId>"),
        { ...(selfId ? { buyer: selfId } : {}), ...bodyFlag(flags) } as never,
      );
    // Jobs & escrow.
    case "jobs":
      return client.jobs.list(
        queryFlags(flags, ["status", "tag", "q", "limit", "offset"]),
      );
    case "job":
      return client.jobs.get(required(first, "job <jobId>"));
    case "job-apply":
      return client.jobs.apply(
        required(first, "job-apply <jobId>"),
        typedBody(flags),
      );
    case "escrows":
      return client.escrow.list(
        queryFlags(flags, ["status", "client", "provider", "limit", "offset"]),
      );
    case "escrow":
      return client.escrow.get(required(first, "escrow <escrowId>"));
    case "escrow-accept":
      return client.escrow.accept(
        required(first, "escrow-accept <escrowId>"),
        selfId,
      );
    case "escrow-deliver":
      return client.escrow.deliver(
        required(first, "escrow-deliver <escrowId>"),
        typedBody(flags),
      );
    case "escrow-accept-delivery":
      return client.escrow.acceptDelivery(
        required(first, "escrow-accept-delivery <escrowId>"),
        selfId,
      );
    case "escrow-release":
      return client.escrow.claimRelease(
        required(first, "escrow-release <escrowId>"),
        selfId,
      );
    case "escrow-refund":
      return client.escrow.claimRefund(
        required(first, "escrow-refund <escrowId>"),
        selfId,
      );
    // Reputation.
    case "reputation":
      return client.reputation.getScore(
        required(first, "reputation <agentId>"),
      );
    case "attest":
      return client.reputation.createAttestation(typedBody(flags));
    case "leaderboard":
      return client.reputation.leaderboard();
    // Pricing.
    case "pricing-quote":
      return client.pricing.quote({
        base: requiredFlag(flags, "base"),
        quote: stringFlag(flags, "quote") ?? "USDC",
        ...(stringFlag(flags, "network")
          ? { network: stringFlag(flags, "network") }
          : {}),
      });
    case "pricing-history":
      return client.pricing.history({
        base: requiredFlag(flags, "base"),
        quote: stringFlag(flags, "quote") ?? "USDC",
        interval: requiredFlag(flags, "interval"),
        ...(stringFlag(flags, "from")
          ? { from: stringFlag(flags, "from") }
          : {}),
        ...(stringFlag(flags, "to") ? { to: stringFlag(flags, "to") } : {}),
      });
    case "pricing-assets":
      return client.pricing.assets();
    case "pricing-pairs":
      return client.pricing.pairs();
    case "pricing-networks":
      return client.pricing.networks();
    case "pricing-gas":
      return client.pricing.gas(requiredFlag(flags, "network"));
    // Signers.
    case "signer-create":
      return client.signers.approve(typedBody(flags));
    case "signers":
      return client.signers.list(stringFlag(flags, "grantor") ?? selfId);
    case "signer":
      return client.signers.get(
        required(first, "signer <signerKey>"),
        stringFlag(flags, "grantor") ?? selfId,
      );
    case "signer-revoke":
      return client.signers.revoke(
        required(first, "signer-revoke <signerKey>"),
        stringFlag(flags, "grantor") ?? selfId,
      );
    // Payments.
    case "pay":
      return client.payments.settle(typedBody(flags));
    case "payment-verify":
      return client.payments.verify(typedBody(flags));
    case "balance":
      return client.payments.supported();
    case "subscription":
      return client.payments.getSubscription(
        required(first, "subscription <id>"),
        stringFlag(flags, "actor") ?? selfId,
      );
    case "subscription-create":
      return client.payments.createSubscription(typedBody(flags));
    case "subscription-cancel":
      return client.payments.cancelSubscription(
        required(first, "subscription-cancel <id>"),
        stringFlag(flags, "actor") ?? selfId,
      );
    // Ledger.
    case "ledger":
      return client.ledger.list(
        flags.recent === true
          ? { limit: 20 }
          : queryFlags(flags, ["agent", "type", "status", "limit"]),
      );
    case "ledger-tx":
    case "ledger-transaction":
      return client.ledger.get(required(first, "ledger-transaction <txId>"));
    case "ledger-verify":
      return client.ledger.verify(typedBody(flags));
    default:
      throw new Error(`unknown command: ${parsed.command}`);
  }
}
