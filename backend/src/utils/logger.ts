import pino from "pino";
import { env } from "../config/env.js";

const redact = ["api_key", "apiKey", "SERPAPI_KEY", "GEMINI_API_KEY", "GROQ_API_KEY", "LLM_API_KEY", "DATABASE_URL", "authorization"];

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: redact.flatMap((k) => [k, `*.${k}`, `req.headers.${k}`]),
    censor: "[redacted]",
  },
  transport:
    env.NODE_ENV === "development"
      ? { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:standard" } }
      : undefined,
});

export function sanitizeForLog(value: unknown): unknown {
  if (typeof value === "string") {
    const key = env.SERPAPI_KEY;
    const llm = env.GEMINI_API_KEY;
    const groq = env.GROQ_API_KEY;
    let out = value;
    if (key) out = out.split(key).join("[redacted]");
    if (llm) out = out.split(llm).join("[redacted]");
    if (groq) out = out.split(groq).join("[redacted]");
    return out;
  }
  if (value && typeof value === "object") {
    const copy: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/key|secret|password|authorization|database_url/i.test(k)) {
        copy[k] = "[redacted]";
      } else {
        copy[k] = sanitizeForLog(v);
      }
    }
    return copy;
  }
  return value;
}
