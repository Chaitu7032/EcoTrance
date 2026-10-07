import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { databaseUrl, env } from "../config/env.js";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const connectionString = databaseUrl();
  if (!connectionString) {
    console.log("DATABASE_URL not set — skipping Postgres migration (in-memory store will be used).");
    return;
  }
  const client = new pg.Client({ connectionString, ssl: env.SUPABASE_DB_SSL ? { rejectUnauthorized: false } : undefined });
  await client.connect();
  const sql = fs.readFileSync(path.join(here, "schema.sql"), "utf8");
  await client.query(sql);
  await client.end();
  console.log("Migration complete.");
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
