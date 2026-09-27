import type { DatabaseSync } from "node:sqlite";
import type { Vote } from "../../domain/types";

interface VoteRow {
  id: string;
  event_id: string;
  user_id: string;
  proposal_id: string;
  created_at: string;
}

function toDomain(row: VoteRow): Vote {
  return {
    id: row.id,
    eventId: row.event_id,
    userId: row.user_id,
    proposalId: row.proposal_id,
    createdAt: new Date(row.created_at),
  };
}

export class VoteRepository {
  constructor(private readonly db: DatabaseSync) {}

  /** Inserts a user's first vote for an event, or repoints their existing one at a new proposal. */
  upsert(vote: Vote): void {
    this.db
      .prepare(
        `INSERT INTO votes (id, event_id, user_id, proposal_id, created_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(event_id, user_id) DO UPDATE SET proposal_id = excluded.proposal_id, created_at = excluded.created_at`,
      )
      .run(vote.id, vote.eventId, vote.userId, vote.proposalId, vote.createdAt.toISOString());
  }

  delete(eventId: string, userId: string): void {
    this.db.prepare("DELETE FROM votes WHERE event_id = ? AND user_id = ?").run(eventId, userId);
  }

  /** Deletes every vote a user has cast, across all events. Returns how many rows were removed. */
  deleteByUser(userId: string): number {
    const result = this.db.prepare("DELETE FROM votes WHERE user_id = ?").run(userId);
    return Number(result.changes);
  }

  /** Deletes every vote cast for a proposal — used when the proposal itself is deleted, since a vote can't outlive it. */
  deleteByProposal(proposalId: string): number {
    const result = this.db.prepare("DELETE FROM votes WHERE proposal_id = ?").run(proposalId);
    return Number(result.changes);
  }

  getByEventAndUser(eventId: string, userId: string): Vote | null {
    const row = this.db
      .prepare("SELECT * FROM votes WHERE event_id = ? AND user_id = ?")
      .get(eventId, userId) as VoteRow | undefined;
    return row ? toDomain(row) : null;
  }

  listByEvent(eventId: string): Vote[] {
    const rows = this.db
      .prepare("SELECT * FROM votes WHERE event_id = ? ORDER BY created_at ASC")
      .all(eventId) as unknown as VoteRow[];
    return rows.map(toDomain);
  }
}
