import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "sqlite",
  dbCredentials: {
    url: `file:${process.env.SQLITE_DB_PATH?.trim() || "./data/liturgy-turner.db"}`,
  },
});
