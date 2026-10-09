import { env } from "./env.js";

/**
 * Single configuration point for SerpApi.
 * Inject SERPAPI_KEY and SERPAPI_BASE_URL via environment.
 * Business logic must never construct SerpApi URLs directly.
 */
export const serpApiConfig = {
  apiKey: env.SERPAPI_KEY,
  baseUrl: env.SERPAPI_BASE_URL,
  mockMode: env.SERPAPI_MOCK_MODE,
  timeoutMs: 25_000,
  maxRetries: 1,
};

export function assertSerpApiConfigured(): void {
  if (serpApiConfig.mockMode) return;
  if (!serpApiConfig.apiKey) {
    throw new Error("SERPAPI_KEY is not configured");
  }
  if (!serpApiConfig.baseUrl) {
    throw new Error("SERPAPI_BASE_URL is not configured");
  }
}
