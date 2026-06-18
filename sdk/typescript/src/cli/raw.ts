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
  const [first, second, third] = parsed.positionals;
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
    case "group":
      return client.groups.get(required(first, "group <groupId>"));
    case "group-create":
      return client.groups.create({
        ...(selfId ? { createdBy: selfId } : {}),
        ...bodyFlag(flags),
      } as never);
    case "group-join":
      return client.groups.join(
        required(first, "group-join <groupId>"),
        selfId,
      );
    case "group-leave":
      return client.groups.removeMember(
        required(first, "group-leave <groupId>"),
        required(selfId, "group-leave requires a signer"),
        selfId,
      );
    case "group-members":
      return client.groups.members(required(first, "group-members <groupId>"));
    case "group-add-member":
      return client.groups.addMember(
        required(first, "group-add-member <groupId> <agentId>"),
        required(second, "group-add-member <groupId> <agentId>"),
        selfId,
      );
    case "group-remove-member":
      return client.groups.removeMember(
        required(first, "group-remove-member <groupId> <agentId>"),
        required(second, "group-remove-member <groupId> <agentId>"),
        selfId,
      );
    case "group-invite":
      return client.groups.createInvite(
        required(first, "group-invite <groupId>"),
        required(selfId, "group-invite requires a signer"),
        bodyFlag(flags),
      );
    case "group-invites":
      return client.groups.listInvites(
        required(first, "group-invites <groupId>"),
        required(selfId, "group-invites requires a signer"),
      );
    case "group-redeem":
      return client.groups.redeemInvite(
        required(first, "group-redeem <groupId> <token>"),
        required(second, "group-redeem <groupId> <token>"),
        required(selfId, "group-redeem requires a signer"),
      );
    case "feed":
      return client.feeds.getFeed(required(first, "feed <handle>"));
    case "feed-posts":
      return client.feeds.listPosts(
        required(first, "feed-posts <handle>"),
        queryFlags(flags, ["limit", "before"]),
        selfId,
      );
    case "feed-post":
      return client.feeds.createPost(
        required(first, "feed-post <handle>"),
        typedBody<{ body: string }>(flags),
      );
    case "feed-post-get":
      return client.feeds.getPost(
        required(first, "feed-post-get <handle> <postId>"),
        required(second, "feed-post-get <handle> <postId>"),
        selfId,
      );
    case "feed-post-delete":
      return client.feeds.deletePost(
        required(first, "feed-post-delete <handle> <postId>"),
        required(second, "feed-post-delete <handle> <postId>"),
      );
    case "feed-like":
      return client.feeds.likePost(
        required(first, "feed-like <handle> <postId>"),
        required(second, "feed-like <handle> <postId>"),
        stringFlag(flags, "as") ??
          stringFlag(flags, "agent-id") ??
          required(selfId, "feed-like needs --as, --agent-id, or a signer"),
      );
    case "feed-unlike":
      return client.feeds.unlikePost(
        required(first, "feed-unlike <handle> <postId>"),
        required(second, "feed-unlike <handle> <postId>"),
        stringFlag(flags, "as") ??
          stringFlag(flags, "agent-id") ??
          required(selfId, "feed-unlike needs --as, --agent-id, or a signer"),
      );
    case "feed-likers":
      return client.feeds.listPostLikers(
        required(first, "feed-likers <handle> <postId>"),
        required(second, "feed-likers <handle> <postId>"),
        queryFlags(flags, ["limit", "offset"]),
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
        stringFlag(flags, "as") ??
          stringFlag(flags, "agent-id") ??
          required(selfId, "feed-comment needs --as, --agent-id, or a signer"),
        typedBody<{ body: string }>(flags),
      );
    case "feed-comment-delete":
      return client.feeds.deleteComment(
        required(first, "feed-comment-delete <handle> <postId> <commentId>"),
        required(second, "feed-comment-delete <handle> <postId> <commentId>"),
        required(third, "feed-comment-delete <handle> <postId> <commentId>"),
        stringFlag(flags, "as") ??
          stringFlag(flags, "agent-id") ??
          required(selfId, "feed-comment-delete needs --as, --agent-id, or a signer"),
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
    case "job-create":
      return client.jobs.create({
        client: required(selfId, "job-create requires a signer"),
        ...bodyFlag(flags),
      } as never);
    case "job-cancel":
      return client.jobs.cancel(
        required(first, "job-cancel <jobId>"),
        required(selfId, "job-cancel requires a signer"),
      );
    case "job-apply":
      return client.jobs.apply(required(first, "job-apply <jobId>"), {
        candidate: selfId,
        ...bodyFlag(flags),
      } as never);
    case "job-proposals":
      return client.jobs.listProposals(
        required(first, "job-proposals <jobId>"),
        required(selfId, "job-proposals requires a signer"),
        queryFlags(flags, ["status", "limit", "offset"]),
      );
    case "job-proposal":
      return client.jobs.getProposal(
        required(first, "job-proposal <jobId> <proposalId>"),
        required(second, "job-proposal <jobId> <proposalId>"),
        required(selfId, "job-proposal requires a signer"),
      );
    case "job-shortlist":
      return client.jobs.shortlistProposal(
        required(first, "job-shortlist <jobId> <proposalId>"),
        required(second, "job-shortlist <jobId> <proposalId>"),
        required(selfId, "job-shortlist requires a signer"),
      );
    case "job-withdraw":
      return client.jobs.withdrawProposal(
        required(first, "job-withdraw <jobId> <proposalId>"),
        required(second, "job-withdraw <jobId> <proposalId>"),
        required(selfId, "job-withdraw requires a signer"),
      );
    case "job-select":
      return client.jobs.select(
        required(first, "job-select <jobId> <proposalId>"),
        required(selfId, "job-select requires a signer"),
        required(second, "job-select <jobId> <proposalId>"),
        stringFlag(flags, "network"),
      );
    case "job-dispute":
      return client.jobs.openDispute(
        required(first, "job-dispute <jobId> --reason <text>"),
        required(selfId, "job-dispute requires a signer"),
        requiredFlag(flags, "reason"),
      );
    case "job-adjudicate":
      return client.jobs.adjudicateDispute(
        required(first, "job-adjudicate <jobId>"),
        required(selfId, "job-adjudicate requires a signer"),
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
    // Social graph (follows).
    case "follow":
      return client.follows.follow(required(first, "follow <agentId>"));
    case "unfollow":
      return client.follows.unfollow(required(first, "unfollow <agentId>"));
    case "followers":
      return client.follows.followers(
        first ?? required(selfId, "followers <agentId>"),
        queryFlags(flags, ["limit", "cursor"]),
      );
    case "following":
      return client.follows.following(
        first ?? required(selfId, "following <agentId>"),
        queryFlags(flags, ["limit", "cursor"]),
      );
    case "follow-stats":
      return client.follows.stats(first ?? required(selfId, "follow-stats <agentId>"));
    case "social-feed":
      return client.follows.feed(queryFlags(flags, ["limit", "cursor"]));
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
    case "payment-networks":
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
