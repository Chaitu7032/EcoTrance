import { serpApiConfig } from "./SerpApiConfig.js";
import type { SerpApiEngine, SerpApiRawHit, SerpApiRequest, SerpApiResponse } from "./SerpApiTypes.js";
import { extractGoogleSearchHits } from "./engines/googleSearch.js";
import { extractGoogleNewsHits } from "./engines/googleNews.js";
import { extractGoogleScholarHits } from "./engines/googleScholar.js";
import { extractGoogleShoppingHits } from "./engines/googleShopping.js";
import { extractGoogleTrendsHits } from "./engines/googleTrends.js";
import { extractGoogleAdsTransparencyHits } from "./engines/googleAdsTransparency.js";
import { extractGooglePatentsHits } from "./engines/googlePatents.js";
import { extractGoogleForumsHits } from "./engines/googleForums.js";
import { extractYoutubeTranscriptHits } from "./engines/youtubeTranscript.js";
import { logger, sanitizeForLog } from "../utils/logger.js";

const extractors: Record<SerpApiEngine, (raw: unknown, q: string) => SerpApiRawHit[]> = {
  google: (raw) => extractGoogleSearchHits(raw),
  google_news: (raw) => extractGoogleNewsHits(raw),
  google_scholar: (raw) => extractGoogleScholarHits(raw),
  google_shopping: (raw) => extractGoogleShoppingHits(raw),
  google_trends: (raw, q) => extractGoogleTrendsHits(raw, q),
  google_ads_transparency: (raw) => extractGoogleAdsTransparencyHits(raw),
  google_patents: (raw) => extractGooglePatentsHits(raw),
  google_forums: (raw) => extractGoogleForumsHits(raw),
  youtube: (raw) => extractYoutubeTranscriptHits(raw),
};

export class SerpApiError extends Error {
  constructor(
    message: string,
    readonly code: "timeout" | "rate_limit" | "invalid_key" | "invalid_engine" | "invalid_query" | "provider_error" | "malformed" | "network" | "unknown",
    readonly status?: number,
  ) {
    super(message);
    this.name = "SerpApiError";
  }
}

export class SerpApiClient {
  constructor(private readonly config = serpApiConfig) {}

  async search(request: SerpApiRequest): Promise<SerpApiResponse> {
    if (!this.config.baseUrl) {
      throw new SerpApiError("SERPAPI_BASE_URL is not configured", "unknown");
    }
    if (!this.config.apiKey) {
      throw new SerpApiError("SERPAPI_KEY is not configured", "invalid_key");
    }

    const url = this.buildUrl(request);
    const started = Date.now();
    logger.info({
      msg: "serpapi_request_start",
      baseUrl: this.config.baseUrl,
      engine: request.engine,
      query: request.q,
      timeoutMs: this.config.timeoutMs,
      url: this.redactedUrl(url),
    });
    let lastError: unknown;
    const attempts = 1 + this.config.maxRetries;

    for (let i = 0; i < attempts; i++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
        const res = await fetch(url, { method: "GET", signal: controller.signal });
        clearTimeout(timer);
        const body = await res.json().catch(() => null);

        if (res.status === 401 || res.status === 403) {
          throw new SerpApiError("Invalid SerpApi API key", "invalid_key", res.status);
        }
        if (res.status === 429) {
          throw new SerpApiError("SerpApi rate limit", "rate_limit", res.status);
        }
        if (res.status === 400) {
          throw new SerpApiError("Invalid search query", "invalid_query", res.status);
        }
        if (!res.ok) {
          const msg = this.readError(body) ?? `SerpApi HTTP ${res.status}`;
          throw new SerpApiError(msg, res.status >= 500 ? "provider_error" : "unknown", res.status);
        }
        if (!body || typeof body !== "object") {
          throw new SerpApiError("Malformed SerpApi response", "malformed", res.status);
        }
        const errText = this.readError(body);
        if (errText) {
          throw new SerpApiError(errText, /engine/i.test(errText) ? "invalid_engine" : "unknown");
        }
        const metadata = (body as Record<string, unknown>).search_metadata;
        if (metadata && typeof metadata === "object" && (metadata as Record<string, unknown>).status === "Error") {
          throw new SerpApiError("SerpApi search status is Error", "unknown");
        }

        const hits = extractors[request.engine](body, request.q);
        logger.info({
          msg: "serpapi_response",
          engine: request.engine,
          resultCount: hits.length,
          latencyMs: Date.now() - started,
        });
        return {
          engine: request.engine,
          query: request.q,
          raw: body,
          hits,
          resultCount: hits.length,
          error: null,
        };
      } catch (err) {
        lastError = err;
        if (err instanceof SerpApiError) throw err;
        if (err instanceof Error && err.name === "AbortError") {
          throw new SerpApiError("SerpApi timeout", "timeout");
        }
        const nodeError = err as NodeJS.ErrnoException;
        const cause = nodeError.cause as NodeJS.ErrnoException | undefined;
        logger.warn({ msg: "serpapi_retry", attempt: i + 1, errorName: nodeError.name, error: sanitizeForLog(nodeError.message), code: nodeError.code, causeCode: cause?.code, causeMessage: sanitizeForLog(cause?.message) });
      }
    }

    throw lastError instanceof SerpApiError
      ? lastError
      : new SerpApiError(`SerpApi network failure: ${lastError instanceof Error ? lastError.message : "unknown error"}`, "network");
  }

  private buildUrl(request: SerpApiRequest): string {
    const url = new URL(this.config.baseUrl);
    url.searchParams.set("engine", request.engine);
    url.searchParams.set("q", request.q);
    url.searchParams.set("api_key", this.config.apiKey);
    url.searchParams.set("hl", "en");
    if (request.engine === "google_trends") {
      url.searchParams.set("data_type", "TIMESERIES");
    }
    if (request.engine === "google_ads_transparency") {
      url.searchParams.set("engine", "google_ads_transparency");
    }
    if (request.extra) {
      for (const [k, v] of Object.entries(request.extra)) {
        if (v === undefined) continue;
        url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  }

  private readError(body: unknown): string | null {
    if (!body || typeof body !== "object") return null;
    const rec = body as Record<string, unknown>;
    if (typeof rec.error === "string") return rec.error;
    return null;
  }

  private redactedUrl(value: string): string {
    const url = new URL(value);
    if (url.searchParams.has("api_key")) url.searchParams.set("api_key", "[REDACTED]");
    return url.toString();
  }
}
