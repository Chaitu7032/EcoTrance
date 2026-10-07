import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";
import { getPool } from "./db/pool.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = createApp();

async function boot() {
  const pool = getPool();
  if (pool) {
    try {
      const here = path.dirname(fileURLToPath(import.meta.url));
      const sql = fs.readFileSync(path.join(here, "db/schema.sql"), "utf8");
      await pool.query(sql);
      logger.info({ msg: "database_ready" });
    } catch (err) {
      logger.warn({
        msg: "database_unavailable_using_memory",
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  } else {
    logger.info({ msg: "no_database_url_using_memory_store" });
  }

  app.listen(env.PORT, () => {
    logger.info({
      msg: "ecotrace_listening",
      port: env.PORT,
      mockMode: env.SERPAPI_MOCK_MODE,
      serpapiBaseConfigured: Boolean(env.SERPAPI_BASE_URL),
    });
  });
}

boot().catch((err) => {
  logger.error({ msg: "boot_failed", error: err instanceof Error ? err.message : "unknown" });
  process.exit(1);
});
