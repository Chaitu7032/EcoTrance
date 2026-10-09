import { env } from "../config/env.js";
import { cacheKey } from "../utils/hash.js";
import { withDb } from "../db/pool.js";

interface Entry {
  storedAt: number;
  payload: unknown;
}

export class QueryCache {
  private mem = new Map<string, Entry>();
  private ttlMs = env.CACHE_TTL_HOURS * 3600_000;

  key(engine: string, query: string, params: Record<string, unknown> = {}): string {
    return cacheKey(engine, query, params);
  }

  async get(engine: string, query: string, params: Record<string, unknown> = {}): Promise<unknown | null> {
    const k = this.key(engine, query, params);
    const hit = this.mem.get(k);
    if (hit && Date.now() - hit.storedAt < this.ttlMs) return hit.payload;
    const db = await withDb(async (pool) => {
      const res = await pool.query(
        "SELECT response_json, created_at FROM query_cache WHERE cache_key = $1",
        [k],
      );
      if (!res.rowCount) return null;
      const created = new Date(res.rows[0].created_at).getTime();
      if (Date.now() - created > this.ttlMs) return null;
      return res.rows[0].response_json;
    });
    if (db) {
      this.mem.set(k, { storedAt: Date.now(), payload: db });
      return db;
    }
    return null;
  }

  async set(engine: string, query: string, payload: unknown, params: Record<string, unknown> = {}): Promise<void> {
    const k = this.key(engine, query, params);
    this.mem.set(k, { storedAt: Date.now(), payload });
    await withDb(async (pool) => {
      await pool.query(
        `INSERT INTO query_cache (cache_key, engine, query, response_json)
         VALUES ($1,$2,$3,$4::jsonb)
         ON CONFLICT (cache_key) DO UPDATE SET response_json = EXCLUDED.response_json, created_at = NOW()`,
        [k, engine, query, JSON.stringify(payload)],
      );
    });
  }
}
