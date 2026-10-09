import pg from "pg";
import { databaseUrl, env } from "../config/env.js";
import { logger } from "../utils/logger.js";

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool | null {
  const connectionString = databaseUrl();
  if (!connectionString) return null;
  if (!pool) {
    pool = new pg.Pool({ connectionString, max: 8, ssl: env.SUPABASE_DB_SSL ? { rejectUnauthorized: false } : undefined });
    pool.on("error", (err) => logger.error({ msg: "postgres_pool_error", error: err.message }));
  }
  return pool;
}

export async function withDb<T>(fn: (client: pg.Pool) => Promise<T>): Promise<T | null> {
  const p = getPool();
  if (!p) return null;
  try {
    return await fn(p);
  } catch (err) {
    logger.error({ msg: "database_failure", error: err instanceof Error ? err.message : "unknown" });
    return null;
  }
}
