import type { DatabaseSync } from "node:sqlite";
import type { MovieProposal } from "../../domain/types";

interface ProposalRow {
  id: string;
  event_id: string;
  user_id: string;
  title: string;
  created_at: string;
}

function toDomain(row: ProposalRow): MovieProposal {
  return {
    id: row.id,
    eventId: row.event_id,
    userId: row.user_id,
    title: row.title,
    createdAt: new Date(row.created_at),
  };
}

export class ProposalRepository {
  constructor(private readonly db: DatabaseSync) {}

  create(proposal: MovieProposal): void {
    this.db
      .prepare("INSERT INTO proposals (id, event_id, user_id, title, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(proposal.id, proposal.eventId, proposal.userId, proposal.title, proposal.createdAt.toISOString());
  }

  getById(id: string): MovieProposal | null {
    const row = this.db.prepare("SELECT * FROM proposals WHERE id = ?").get(id) as ProposalRow | undefined;
    return row ? toDomain(row) : null;
  }

  listByEvent(eventId: string): MovieProposal[] {
    const rows = this.db
      .prepare("SELECT * FROM proposals WHERE event_id = ? ORDER BY created_at ASC")
      .all(eventId) as unknown as ProposalRow[];
    return rows.map(toDomain);
  }

  countByEventAndUser(eventId: string, userId: string): number {
    const row = this.db
      .prepare("SELECT COUNT(*) as count FROM proposals WHERE event_id = ? AND user_id = ?")
      .get(eventId, userId) as { count: number };
    return row.count;
  }
}
