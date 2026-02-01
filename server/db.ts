import * as schema from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

/**
 * Local-first database.
 *
 * For the WSL/Ubuntu deployment we default to a local SQLite DB file.
 * This keeps all learning data (training events, fingerprints, dictionary, etc.)
 * on the host PC.
 */
const dbPath = process.env.SQLITE_DB_PATH?.trim() || "./data/liturgy-turner.db";
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
// Better concurrency defaults for a local single-machine app.
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
