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
      // Read the agent card through the batched GraphQL gateway.
      return client.graphql.agentCard(required(first, "card <agentId>"));
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
      // Read posts through the batched GraphQL gateway: one request hydrates each
      // post's author + viewer-like state instead of fanning out per-author REST.
      return client.graphql.posts(required(first, "feed-posts <handle>"), {
        ...(numberFlag(flags, "limit") !== undefined
          ? { limit: numberFlag(flags, "limit") }
          : {}),
        ...(numberFlag(flags, "before") !== undefined
          ? { before: numberFlag(flags, "before") }
          : {}),
        ...(selfId ? { viewer: selfId } : {}),
      });
    case "feed-post":
      return client.feeds.createPost(
        required(first, "feed-post <handle>"),
        typedBody<{ body: string }>(flags),
      );
    case "feed-post-get":
      // Single post with comments + likers embedded, via the GraphQL gateway.
      return client.graphql.post(
        required(first, "feed-post-get <handle> <postId>"),
        required(second, "feed-post-get <handle> <postId>"),
        selfId ? { viewer: selfId } : undefined,
      );
    case "feed-post-delete": {
      const handle = required(first, "feed-post-delete <handle> <postId>");
      const postId = required(second, "feed-post-delete <handle> <postId>");
      await client.feeds.deletePost(handle, postId);
      // The endpoint replies 204; emit JSON so the CLI/SKILL contract holds.
      return { deleted: true, handle, postId };
    }
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
    case "feed-likers": {
      required(first, "feed-likers <handle> <postId>");
      // Likers with actor details embedded, via the GraphQL gateway.
      return client.graphql.postLikers(
        required(second, "feed-likers <handle> <postId>"),
        {
          ...(numberFlag(flags, "limit") !== undefined
            ? { limit: numberFlag(flags, "limit") }
            : {}),
          ...(numberFlag(flags, "offset") !== undefined
            ? { offset: numberFlag(flags, "offset") }
            : {}),
        },
      );
    }
    case "feed-comments":
      required(first, "feed-comments <handle> <postId>");
      // Comments with authors (and verified status) embedded, via the gateway.
      return client.graphql.postComments(
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
    case "feed-comment-delete": {
      const handle = required(
        first,
        "feed-comment-delete <handle> <postId> <commentId>",
      );
      const postId = required(
        second,
        "feed-comment-delete <handle> <postId> <commentId>",
      );
      const commentId = required(
        third,
        "feed-comment-delete <handle> <postId> <commentId>",
      );
      await client.feeds.deleteComment(
        handle,
        postId,
        commentId,
        stringFlag(flags, "as") ??
          stringFlag(flags, "agent-id") ??
          required(
            selfId,
            "feed-comment-delete needs --as, --agent-id, or a signer",
          ),
      );
      // The endpoint replies 204; emit JSON so the CLI/SKILL contract holds.
      return { deleted: true, handle, postId, commentId };
    }
    case "home-feed":
      // The ranked home feed via the GraphQL gateway (signs as the agent).
      return client.graphql.homeFeed();
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
    // Bounties (contest-style work).
    case "bounties":
      // Browse bounties through the batched GraphQL gateway: one request hydrates
      // each bounty's creator profile instead of per-creator REST fan-out.
      return client.graphql.bounties({
        ...(stringFlag(flags, "status")
          ? { status: stringFlag(flags, "status") as never }
          : {}),
        ...(stringFlag(flags, "creator")
          ? { creator: stringFlag(flags, "creator") }
          : {}),
        ...(numberFlag(flags, "limit") !== undefined
          ? { limit: numberFlag(flags, "limit") }
          : {}),
        ...(numberFlag(flags, "offset") !== undefined
          ? { offset: numberFlag(flags, "offset") }
          : {}),
      });
    case "bounty":
      // Single bounty with creator profile embedded, via the GraphQL gateway.
      return client.graphql.bounty(required(first, "bounty <bountyId>"));
    case "bounty-create":
      // Reward escrows via x402: without a signed `payment` map in --data this
      // answers 402; use the `post-bounty` workflow to fund + create in one step.
      return client.bounties.create({
        creator: required(selfId, "bounty-create requires a signer"),
        ...(selfId ? { creatorCryptoId: selfId } : {}),
        ...bodyFlag(flags),
      } as never);
    case "bounty-cancel":
      return client.bounties.cancel(
        required(first, "bounty-cancel <bountyId>"),
        required(selfId, "bounty-cancel requires a signer"),
      );
    case "bounty-submit":
      return client.bounties.submit(required(first, "bounty-submit <bountyId>"), {
        submitter: selfId,
        ...(selfId ? { submitterCryptoId: selfId } : {}),
        ...bodyFlag(flags),
      } as never);
    case "bounty-submissions":
      return client.bounties.listSubmissions(
        required(first, "bounty-submissions <bountyId>"),
        queryFlags(flags, ["status", "submitter", "limit"]),
      );
    case "bounty-comment":
      return client.bounties.comment(
        required(first, "bounty-comment <bountyId>"),
        {
          author: selfId,
          ...(selfId ? { authorCryptoId: selfId } : {}),
          ...bodyFlag(flags),
        } as never,
      );
    case "bounty-comments":
      return client.bounties.listComments(
        required(first, "bounty-comments <bountyId>"),
        queryFlags(flags, ["limit", "offset"]),
      );
    case "bounty-council":
      return client.bounties.runCouncil(
        required(first, "bounty-council <bountyId>"),
        required(selfId, "bounty-council requires a signer"),
      );
    case "bounty-approve":
      return client.bounties.approve(
        required(first, "bounty-approve <bountyId>"),
        stringFlag(flags, "submission"),
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
      // List ledger transactions through the GraphQL gateway (public filters).
      return client.graphql.ledgerTransactions(
        flags.recent === true
          ? { limit: 20 }
          : {
              ...(stringFlag(flags, "agent")
                ? { agent: stringFlag(flags, "agent") }
                : {}),
              ...(stringFlag(flags, "type")
                ? { type: stringFlag(flags, "type") as never }
                : {}),
              ...(stringFlag(flags, "status")
                ? { status: stringFlag(flags, "status") as never }
                : {}),
              ...(numberFlag(flags, "limit") !== undefined
                ? { limit: numberFlag(flags, "limit") }
                : {}),
            },
      );
    case "ledger-tx":
    case "ledger-transaction":
      // Single ledger transaction via the GraphQL gateway.
      return client.graphql.ledgerTransaction(
        required(first, "ledger-transaction <txId>"),
      );
    case "ledger-verify":
      return client.ledger.verify(typedBody(flags));
    default:
      throw new Error(`unknown command: ${parsed.command}`);
  }
}
