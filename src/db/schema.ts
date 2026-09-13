export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS guild_config (
  guild_id TEXT PRIMARY KEY,
  max_proposals_per_user INTEGER NOT NULL,
  voting_close_minutes_before_event INTEGER NOT NULL,
  default_time_zone TEXT NOT NULL DEFAULT 'UTC'
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  creator_id TEXT NOT NULL,
  event_time TEXT NOT NULL,
  voting_close_time TEXT NOT NULL,
  status TEXT NOT NULL,
  winning_proposal_id TEXT,
  discord_event_id TEXT,
  announcement_message_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_guild ON events(guild_id);

CREATE TABLE IF NOT EXISTS proposals (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id),
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_proposals_event ON proposals(event_id);

CREATE TABLE IF NOT EXISTS votes (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id),
  user_id TEXT NOT NULL,
  proposal_id TEXT NOT NULL REFERENCES proposals(id),
  created_at TEXT NOT NULL,
  UNIQUE(event_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_votes_event ON votes(event_id);
`;
