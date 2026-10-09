import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const here = path.dirname(fileURLToPath(import.meta.url));
// Backend-only secrets live beside the backend and are never exposed to Vite.
dotenv.config({ path: path.resolve(here, "../../.env") });
dotenv.config();

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(5000),
  DATABASE_URL: z.string().optional().default(""),
  SUPABASE_DB_URL: z.string().optional().default(""),
  SUPABASE_DB_SSL: z.string().optional().default("true").transform((v) => v !== "false" && v !== "0"),
  SERPAPI_KEY: z.string().optional().default(""),
  SERPAPI_BASE_URL: z.string().url().optional().default("https://serpapi.com/search.json"),
  SERPAPI_MOCK_MODE: z
    .string()
    .optional()
    .default("false")
    .transform((v) => v === "true" || v === "1"),
  GEMINI_API_KEY: z.string().optional().default(""),
  GEMINI_MODEL: z.string().optional().default("gemini-2.5-flash"),
  GROQ_API_KEY: z.string().optional().default(""),
  GROQ_BASE_URL: z.string().url().optional().default("https://api.groq.com/openai/v1"),
  GROQ_MODEL: z.string().optional().default("llama-3.3-70b-versatile"),
  LLM_MAX_INPUT_PER_REQUEST: z.coerce.number().default(3500),
  LLM_MAX_SIMPLE_CALLS: z.coerce.number().default(3),
  LLM_MAX_DEEP_CALLS: z.coerce.number().default(4),
  LLM_TPM_LIMIT: z.coerce.number().default(8000),
  AUDIT_MAX_REQUESTS: z.coerce.number().default(80),
  SIMPLE_AUDIT_MAX_SEARCHES: z.coerce.number().default(8),
  DEEP_AUDIT_MAX_SEARCHES: z.coerce.number().default(16),
  GLOBAL_MAX_REQUESTS: z.coerce.number().default(400),
  CACHE_TTL_HOURS: z.coerce.number().default(24),
  FRONTEND_URL: z.string().optional().default("http://localhost:5173"),
  LOG_LEVEL: z.string().optional().default("info"),
});

export const env = schema.parse(process.env);

export function databaseUrl(): string {
  return env.DATABASE_URL || env.SUPABASE_DB_URL;
}

export function isMockMode(): boolean {
  if (process.env.SERPAPI_MOCK_MODE !== undefined) {
    return process.env.SERPAPI_MOCK_MODE === "true" || process.env.SERPAPI_MOCK_MODE === "1";
  }
  return env.SERPAPI_MOCK_MODE;
}

