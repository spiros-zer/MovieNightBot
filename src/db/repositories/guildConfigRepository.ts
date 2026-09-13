import type { DatabaseSync } from "node:sqlite";
import { DEFAULT_GUILD_CONFIG, type GuildConfig } from "../../domain/types";

interface GuildConfigRow {
  guild_id: string;
  max_proposals_per_user: number;
  voting_close_minutes_before_event: number;
  default_time_zone: string;
}

function toDomain(row: GuildConfigRow): GuildConfig {
  return {
    guildId: row.guild_id,
    maxProposalsPerUser: row.max_proposals_per_user,
    votingCloseMinutesBeforeEvent: row.voting_close_minutes_before_event,
    defaultTimeZone: row.default_time_zone,
  };
}

export class GuildConfigRepository {
  constructor(private readonly db: DatabaseSync) {}

  getOrDefault(guildId: string): GuildConfig {
    const row = this.db
      .prepare("SELECT * FROM guild_config WHERE guild_id = ?")
      .get(guildId) as GuildConfigRow | undefined;

    if (!row) {
      return { guildId, ...DEFAULT_GUILD_CONFIG };
    }
    return toDomain(row);
  }

  upsert(config: GuildConfig): void {
    this.db
      .prepare(
        `INSERT INTO guild_config (guild_id, max_proposals_per_user, voting_close_minutes_before_event, default_time_zone)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(guild_id) DO UPDATE SET
           max_proposals_per_user = excluded.max_proposals_per_user,
           voting_close_minutes_before_event = excluded.voting_close_minutes_before_event,
           default_time_zone = excluded.default_time_zone`,
      )
      .run(config.guildId, config.maxProposalsPerUser, config.votingCloseMinutesBeforeEvent, config.defaultTimeZone);
  }
}
