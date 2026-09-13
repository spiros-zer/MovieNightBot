import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { SCHEMA_SQL } from "./schema";

// Loaded via process.getBuiltinModule (rather than a static `import ... from "node:sqlite"`)
// because node:sqlite is a prefix-only builtin: some bundlers/transformers (Vite/vite-node
// included) strip the "node:" prefix when resolving static import specifiers, and "sqlite"
// alone isn't a recognized builtin name, which breaks resolution.
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");

export function createDatabase(path: string): DatabaseSyncType {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA_SQL);
  migrate(db);
  return db;
}

/** Additive migrations for databases created before a column existed; CREATE TABLE IF NOT EXISTS above doesn't touch existing tables. */
function migrate(db: DatabaseSyncType): void {
  const eventColumns = db.prepare("PRAGMA table_info(events)").all() as unknown as { name: string }[];
  if (!eventColumns.some((c) => c.name === "discord_event_id")) {
    db.exec("ALTER TABLE events ADD COLUMN discord_event_id TEXT");
  }
  if (!eventColumns.some((c) => c.name === "announcement_message_id")) {
    db.exec("ALTER TABLE events ADD COLUMN announcement_message_id TEXT");
  }

  const guildConfigColumns = db.prepare("PRAGMA table_info(guild_config)").all() as unknown as { name: string }[];
  if (!guildConfigColumns.some((c) => c.name === "default_time_zone")) {
    db.exec("ALTER TABLE guild_config ADD COLUMN default_time_zone TEXT NOT NULL DEFAULT 'UTC'");
  }
}
