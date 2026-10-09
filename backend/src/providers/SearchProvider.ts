import type { EvidenceSource, SearchEngine } from "@ecotrace/shared";
import type { TrendsPayload } from "../serpapi/SerpApiTypes.js";

export interface SearchOptions {
  auditId: string;
  extra?: Record<string, string | number | boolean | undefined>;
  purpose?: string;
  claimId?: string | null;
}

export interface SearchResult {
  sources: EvidenceSource[];
  cached: boolean;
  creditsUsed: number;
  engine: SearchEngine;
  query: string;
  error?: string;
  trends?: TrendsPayload;
}

export interface SearchProvider {
  searchWeb(query: string, options: SearchOptions): Promise<SearchResult>;
  searchNews(query: string, options: SearchOptions): Promise<SearchResult>;
  searchScholar(query: string, options: SearchOptions): Promise<SearchResult>;
  searchShopping(query: string, options: SearchOptions): Promise<SearchResult>;
  searchTrends(query: string, options: SearchOptions): Promise<SearchResult>;
}
