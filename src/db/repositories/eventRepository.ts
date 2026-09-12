import type { DatabaseSync } from "node:sqlite";
import type { EventStatus, MovieNightEvent } from "../../domain/types";

interface EventRow {
  id: string;
  guild_id: string;
  channel_id: string;
  creator_id: string;
  event_time: string;
  voting_close_time: string;
  status: EventStatus;
  winning_proposal_id: string | null;
}

function toDomain(row: EventRow): MovieNightEvent {
  return {
    id: row.id,
    guildId: row.guild_id,
    channelId: row.channel_id,
    creatorId: row.creator_id,
    eventTime: new Date(row.event_time),
    votingCloseTime: new Date(row.voting_close_time),
    status: row.status,
    winningProposalId: row.winning_proposal_id,
  };
}

export class EventRepository {
  constructor(private readonly db: DatabaseSync) {}

  create(event: MovieNightEvent): void {
    this.db
      .prepare(
        `INSERT INTO events (id, guild_id, channel_id, creator_id, event_time, voting_close_time, status, winning_proposal_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        event.id,
        event.guildId,
        event.channelId,
        event.creatorId,
        event.eventTime.toISOString(),
        event.votingCloseTime.toISOString(),
        event.status,
        event.winningProposalId,
      );
  }

  getById(id: string): MovieNightEvent | null {
    const row = this.db.prepare("SELECT * FROM events WHERE id = ?").get(id) as EventRow | undefined;
    return row ? toDomain(row) : null;
  }

  listOpenEventsForGuild(guildId: string): MovieNightEvent[] {
    const rows = this.db
      .prepare("SELECT * FROM events WHERE guild_id = ? AND status = 'open' ORDER BY event_time ASC")
      .all(guildId) as unknown as EventRow[];
    return rows.map(toDomain);
  }

  listPendingEvents(): MovieNightEvent[] {
    const rows = this.db.prepare("SELECT * FROM events WHERE status = 'open'").all() as unknown as EventRow[];
    return rows.map(toDomain);
  }

  updateStatus(id: string, status: EventStatus, winningProposalId: string | null = null): void {
    this.db
      .prepare("UPDATE events SET status = ?, winning_proposal_id = ? WHERE id = ?")
      .run(status, winningProposalId, id);
  }
}
