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

  create(vote: Vote): void {
    this.db
      .prepare("INSERT INTO votes (id, event_id, user_id, proposal_id, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(vote.id, vote.eventId, vote.userId, vote.proposalId, vote.createdAt.toISOString());
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
