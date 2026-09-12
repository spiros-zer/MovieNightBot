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
  return db;
}
