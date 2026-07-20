import { getDb } from '../db';
import { Bounty, BountyEntry, BountyWinner } from '../models';
import { v4 as uuid } from 'uuid';

interface SelectionResult {
  winner: BountyEntry;
  runnerUp: BountyEntry | null;
  scores: Array<{ entryId: string; score: number }>;
  queryTimestamp: number;
  rationale: string;
}

/**
 * Select the winner for a bounty based on total engagement
 * (impressions + comments + custom engagement metric).
 * Time window is the bounty's active period.
 * Eligibility filters (account age, verified, etc.) are applied and logged.
 * Returns audit trail with rationale.
 */
export async function selectBountyWinner(bountyId: string): Promise<SelectionResult> {
  const db = getDb();
  const bounty = await db.get<Bounty>('SELECT * FROM bounties WHERE id = ?', [bountyId]);
  if (!bounty) throw new Error(`Bounty ${bountyId} not found`);

  const now = Date.now();
  const entries = await db.all<BountyEntry[]>(
    `SELECT * FROM bounty_entries WHERE bounty_id = ? AND status = 'active' AND created_at >= ? AND created_at <= ?`,
    [bountyId, bounty.startTime, bounty.endTime]
  );

  // Compute scores: impressions + comments + engagement
  const scores = await Promise.all(entries.map(async (entry) => {
    const stats = await db.get<{ impressions: number; comments: number; engagement: number }>(
      `SELECT COALESCE(SUM(impressions),0) AS impressions,
              COALESCE(SUM(comments),0) AS comments,
              COALESCE(SUM(engagement),0) AS engagement
       FROM post_stats WHERE user_id = ? AND post_time >= ? AND post_time <= ?`,
      [entry.userId, bounty.startTime, bounty.endTime]
    );
    const totalScore = stats.impressions + stats.comments + stats.engagement;
    return { entryId: entry.id, userId: entry.userId, score: totalScore };
  }));

  // Apply eligibility filters (example: account age >= 7 days, email verified)
  const eligible = scores.filter(async (s) => {
    const user = await db.get<{ createdAt: number; emailVerified: boolean }>(
      'SELECT created_at AS createdAt, email_verified AS emailVerified FROM users WHERE id = ?',
      [s.userId]
    );
    if (!user) return false;
    const accountAgeDays = (now - user.createdAt) / (1000 * 60 * 60 * 24);
    if (accountAgeDays < 7) {
      console.warn(`User ${s.userId} disqualified: account age ${accountAgeDays.toFixed(1)} days < 7`); // audit log
      return false;
    }
    if (!user.emailVerified) {
      console.warn(`User ${s.userId} disqualified: email not verified`);
      return false;
    }
    return true;
  });
  const eligibleScores = await Promise.all(eligible); // resolve async filter
  const finalScores = eligibleScores.filter(Boolean).map((v) => v!);

  if (finalScores.length === 0) {
    throw new Error('No eligible entries for bounty');
  }

  // Sort descending by score
  finalScores.sort((a, b) => b.score - a.score);
  const winner = entries.find(e => e.id === finalScores[0].entryId)!;
  const runnerUp = finalScores.length > 1 ? entries.find(e => e.id === finalScores[1].entryId) : null;

  const result: SelectionResult = {
    winner,
    runnerUp: runnerUp ?? null,
    scores: finalScores.map(s => ({ entryId: s.entryId, score: s.score })),
    queryTimestamp: now,
    rationale: `Total engagement score (impressions+comments+engagement) computed from post_stats for period [${bounty.startTime}, ${bounty.endTime}]. Eligibility filters applied: account age >=7 days, email verified. Winner: user ${winner.userId} with score ${finalScores[0].score}.`
  };

  // Log audit trail to database
  await db.run(
    `INSERT INTO bounty_audit_log (id, bounty_id, winner_user_id, winner_score, runner_up_user_id, runner_up_score, query_timestamp, rationale, scores_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [uuid(), bountyId, winner.userId, finalScores[0].score, runnerUp?.userId ?? null, finalScores[1]?.score ?? null, now, result.rationale, JSON.stringify(result.scores)]
  );

  return result;
