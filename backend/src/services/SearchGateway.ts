import { randomUUID } from "node:crypto";
import type { EvidenceSource, SearchEngine, SearchRequestRecord } from "@ecotrace/shared";
import { SerpApiClient, SerpApiError } from "../serpapi/SerpApiClient.js";
import type { SerpApiEngine, SerpApiResponse } from "../serpapi/SerpApiTypes.js";
import { QueryCache } from "../cache/QueryCache.js";
import { creditManager } from "./CreditManager.js";
import { hitsToSources } from "../analysis/normalize.js";
import { normalizeQuery } from "../utils/url.js";
import { sha256 } from "../utils/hash.js";
import { logger } from "../utils/logger.js";
import { env, isMockMode } from "../config/env.js";
import { mockResponse } from "../fixtures/demo.js";
import { extractGoogleTrends } from "../serpapi/engines/googleTrends.js";
import { store } from "../repositories/Store.js";
import type { SearchOptions, SearchProvider, SearchResult } from "../providers/SearchProvider.js";

const inFlight = new Map<string, Promise<SearchResult>>();

export class SearchGateway implements SearchProvider {
  constructor(
    private readonly client = new SerpApiClient(),
    private readonly cache = new QueryCache(),
  ) {}

  searchWeb(query: string, options: SearchOptions) {
    return this.execute("google", query, options);
  }
  searchNews(query: string, options: SearchOptions) {
    return this.execute("google_news", query, options);
  }
  searchScholar(query: string, options: SearchOptions) {
    return this.execute("google_scholar", query, options);
  }
  searchShopping(query: string, options: SearchOptions) {
    return this.execute("google_shopping", query, options);
  }
  searchTrends(query: string, options: SearchOptions) {
    return this.execute("google_trends", query, options);
  }
  searchAdsTransparency(query: string, options: SearchOptions) {
    return this.execute("google_ads_transparency", query, options);
  }
  searchPatents(query: string, options: SearchOptions) {
    return this.execute("google_patents", query, options);
  }
  searchForums(query: string, options: SearchOptions) {
    return this.execute("google_forums", query, options);
  }
  searchYoutube(query: string, options: SearchOptions) {
    return this.execute("youtube", query, options);
  }

  private async execute(engine: SearchEngine, rawQuery: string, options: SearchOptions): Promise<SearchResult> {
    const query = normalizeQuery(rawQuery);
    const dedupeKey = `${options.auditId}|${engine}|${query}|${JSON.stringify(options.extra ?? {})}`;
    const existing = inFlight.get(dedupeKey);
    if (existing) return existing;
    const run = this.run(engine, query, rawQuery, options);
    inFlight.set(dedupeKey, run);
    try {
      return await run;
    } finally {
      inFlight.delete(dedupeKey);
    }
  }

  private async run(
    engine: SearchEngine,
    query: string,
    original: string,
    options: SearchOptions,
  ): Promise<SearchResult> {
    const started = Date.now();
    const cached = await this.cache.get(engine, query, options.extra ?? {});
    if (cached) {
      creditManager.recordCached(options.auditId);
      const parsed = cached as SerpApiResponse;
      const sources = this.toSources(parsed, engine, query, options);
      this.logRequest({
        auditId: options.auditId,
        engine,
        query,
        cached: true,
        creditsUsed: 0,
        resultCount: sources.length,
        status: "cached",
        error: null,
        latencyMs: Date.now() - started,
        claimId: options.claimId ?? null,
        purpose: options.purpose ?? "search",
        hash: sha256(JSON.stringify(parsed.hits ?? [])),
      });
      return {
        sources,
        cached: true,
        creditsUsed: 0,
        engine,
        query: original,
        trends: engine === "google_trends" ? extractGoogleTrends(parsed.raw, original) : undefined,
      };
    }

    if (!creditManager.canSpend(options.auditId)) {
      this.logRequest({
        auditId: options.auditId,
        engine,
        query: original,
        cached: false,
        creditsUsed: 0,
        resultCount: 0,
        status: "skipped",
        error: "audit or global credit budget exhausted",
        latencyMs: Date.now() - started,
        claimId: options.claimId ?? null,
        purpose: options.purpose ?? "search",
        hash: null,
      });
      return { sources: [], cached: false, creditsUsed: 0, engine, query: original, error: "search budget exhausted" };
    }

    try {
      let parsed: SerpApiResponse;
      if (isMockMode()) {
        parsed = mockResponse(engine as SerpApiEngine, original);
      } else {
        parsed = await this.client.search({ engine: engine as SerpApiEngine, q: query, extra: options.extra });
      }
      // Mock calls still consume the audit's search slot so tests exercise the
      // same hard budget as production; they simply consume no real credits.
      creditManager.spend(options.auditId, 1);

      await this.cache.set(engine, query, parsed, options.extra ?? {});
      const sources = this.toSources(parsed, engine, query, options);
      this.logRequest({
        auditId: options.auditId,
        engine,
        query: original,
        cached: isMockMode(),
        creditsUsed: isMockMode() ? 0 : 1,
        resultCount: sources.length,
        status: sources.length ? "success" : "no_results",
        error: null,
        latencyMs: Date.now() - started,
        claimId: options.claimId ?? null,
        purpose: options.purpose ?? "search",
        hash: sha256(JSON.stringify(parsed.hits ?? [])),
      });
      logger.info({
        msg: "serpapi_request",
        auditId: options.auditId,
        engine,
        query: original,
        cached: false,
        mock: isMockMode(),
        resultCount: sources.length,
        latencyMs: Date.now() - started,
      });
      return {
        sources,
        cached: isMockMode(),
        creditsUsed: isMockMode() ? 0 : 1,
        engine,
        query: original,
        trends: engine === "google_trends" ? extractGoogleTrends(parsed.raw, original) : undefined,
      };
    } catch (err) {
      const outcome = classifySearchError(err);
      this.logRequest({
        auditId: options.auditId,
        engine,
        query: original,
        cached: false,
        creditsUsed: 0,
        resultCount: 0,
        status: outcome.status,
        error: outcome.message,
        latencyMs: Date.now() - started,
        claimId: options.claimId ?? null,
        purpose: options.purpose ?? "search",
        hash: null,
      });
      logger.warn({ msg: "serpapi_engine_failed", auditId: options.auditId, engine, query, outcome: outcome.status });
      return {
        sources: [],
        cached: false,
        creditsUsed: 0,
        engine,
        query: original,
        error: outcome.message,
      };
    }
  }

  private toSources(
    parsed: SerpApiResponse,
    engine: SearchEngine,
    query: string,
    options: SearchOptions,
  ): EvidenceSource[] {
    const bundle = store.getAudit(options.auditId);
    return hitsToSources({
      hits: parsed.hits,
      engine,
      query,
      companyDomain: bundle?.company.officialDomain,
      companyName: bundle?.company.name,
    });
  }

  private logRequest(input: {
    auditId: string;
    engine: SearchEngine;
    query: string;
    cached: boolean;
    creditsUsed: number;
    resultCount: number;
    status: SearchRequestRecord["status"];
    error: string | null;
    latencyMs: number;
    claimId: string | null;
    purpose: string;
    hash: string | null;
  }): void {
    const rec: SearchRequestRecord = {
      id: randomUUID(),
      auditId: input.auditId,
      engine: input.engine,
      query: input.query,
      requestedAt: new Date().toISOString(),
      status: input.status,
      responseHash: input.hash,
      resultCount: input.resultCount,
      creditsUsed: input.creditsUsed,
      cached: input.cached,
      error: input.error,
      latencyMs: input.latencyMs,
      claimId: input.claimId,
      purpose: input.purpose,
    };
    try {
      store.appendRequest(input.auditId, rec);
    } catch {
      /* audit may not exist yet during health checks */
    }
  }
}

function classifySearchError(err: unknown): { status: SearchRequestRecord["status"]; message: string } {
  if (!(err instanceof SerpApiError)) return { status: "unknown_error", message: "Search failed." };
  switch (err.code) {
    case "invalid_query": return { status: "invalid_query", message: "Query could not be processed." };
    case "invalid_key": return { status: "auth_error", message: "Search configuration issue." };
    case "rate_limit": return { status: "rate_limited", message: "Search temporarily limited." };
    case "timeout": return { status: "timeout", message: "Search timed out." };
    case "network": return { status: "network_error", message: "Network issue while searching." };
    case "provider_error": return { status: "provider_error", message: "Search provider unavailable." };
    default: return { status: "unknown_error", message: "Search failed." };
  }
}

export const searchGateway = new SearchGateway();

export function mockModeBadge(): boolean {
  return env.SERPAPI_MOCK_MODE;
}
