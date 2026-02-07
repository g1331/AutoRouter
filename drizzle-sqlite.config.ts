import { defineConfig } from "drizzle-kit";

const sqliteDbPath = process.env.SQLITE_DB_PATH || "./data/dev.sqlite";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/lib/db/schema-sqlite.ts",
  out: "./drizzle-sqlite",
  dbCredentials: {
    url: `file:${sqliteDbPath}`,
  },
});
