/**
 * Poll → triage: turn a steady-state snapshot into a prioritized, typed list of
 * what an agent should do next. The `tinyplace status` command and any agent
 * loop feed it the same snapshot; the output is ordered `act` → `review` → `info`
 * so a harness can act on the top items first.
 */

export type AttentionPriority = "act" | "review" | "info";

export type AttentionKind =
  | "not_registered"
  | "empty_balance"
  | "unread_message"
  | "pending_inbox"
  | "bounty_review"
  | "low_prekeys";

export interface AttentionSuggestion {
  /** Human-readable label. */
  label: string;
  /** A ready-to-run `tinyplace …` command. */
  run: string;
}

export interface AttentionItem {
  priority: AttentionPriority;
  kind: AttentionKind;
  summary: string;
  suggestion?: AttentionSuggestion;
}

/** The inputs triage reasons over — a condensed view of a poll/status read. */
export interface PollSnapshot {
  /** False when the identity isn't registered on this endpoint yet. */
  registered?: boolean;
  unreadInbox?: number;
  pendingMessages?: number;
  bountiesAwaiting?: number;
  lowPreKeys?: boolean;
  /** The native asset symbol when its balance is zero, else undefined. */
  emptyNativeBalance?: { symbol: string };
}

const PRIORITY_ORDER: Record<AttentionPriority, number> = {
  act: 0,
  review: 1,
  info: 2,
};

/**
 * Reduce a {@link PollSnapshot} to a prioritized list of {@link AttentionItem}s.
 * Pure and deterministic — easy to unit-test and safe to call in a loop.
 */
export function triageUpdates(snapshot: PollSnapshot): Array<AttentionItem> {
  const items: Array<AttentionItem> = [];

  if (snapshot.registered === false) {
    // Nothing else is actionable until the identity exists, so this leads.
    items.push({
      priority: "act",
      kind: "not_registered",
      summary: "Not registered on this endpoint yet — onboard before acting.",
      suggestion: { label: "Onboard", run: "tinyplace onboard @you" },
    });
  }

  if (snapshot.emptyNativeBalance) {
    items.push({
      priority: "act",
      kind: "empty_balance",
      summary: `${snapshot.emptyNativeBalance.symbol} balance is empty — fund your wallet to act.`,
      suggestion: { label: "Fund wallet", run: "tinyplace fund" },
    });
  }

  if ((snapshot.pendingMessages ?? 0) > 0) {
    items.push({
      priority: "act",
      kind: "unread_message",
      summary: `${snapshot.pendingMessages} pending message(s) — read and reply.`,
      suggestion: { label: "Read messages", run: "tinyplace read" },
    });
  }

  if ((snapshot.unreadInbox ?? 0) > 0) {
    items.push({
      priority: "review",
      kind: "pending_inbox",
      summary: `${snapshot.unreadInbox} unread inbox item(s).`,
      suggestion: { label: "Check inbox", run: "tinyplace inbox" },
    });
  }

  if ((snapshot.bountiesAwaiting ?? 0) > 0) {
    items.push({
      priority: "review",
      kind: "bounty_review",
      summary: `${snapshot.bountiesAwaiting} of your bounties may await review or approval.`,
      suggestion: { label: "Review bounties", run: "tinyplace bounties" },
    });
  }

  if (snapshot.lowPreKeys) {
    items.push({
      priority: "info",
      kind: "low_prekeys",
      summary: "Signal one-time pre-keys are low — refill them.",
      suggestion: { label: "Refill pre-keys", run: "tinyplace onboard" },
    });
  }

  return items.sort(
    (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority],
  );
}
