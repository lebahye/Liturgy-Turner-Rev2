import * as schema from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import path from "node:path";

/**
 * SQLite database connection.
 * Local-first: no PostgreSQL required, no Docker dependency.
 * Database file lives alongside the app in ./data/
 */
const dbPath = process.env.SQLITE_DB_PATH || path.join(process.cwd(), "data", "liturgy-turner.db");

const sqlite = new Database(dbPath);

// Enable WAL mode for better concurrent read performance
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

// Export raw sqlite connection for direct queries (dictionary browser, db viewer)
export const rawDb = sqlite;
