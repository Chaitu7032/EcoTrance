export type SerpApiEngine =
  | "google"
  | "google_news"
  | "google_scholar"
  | "google_shopping"
  | "google_trends"
  | "google_ads_transparency"
  | "google_patents"
  | "google_forums"
  | "youtube";

export interface SerpApiRequest {
  engine: SerpApiEngine;
  q: string;
  extra?: Record<string, string | number | boolean | undefined>;
}

export interface SerpApiRawHit {
  title: string;
  url: string;
  snippet: string;
  sourceName: string;
  publishedAt: string | null;
  metadata: Record<string, unknown>;
}

export interface SerpApiResponse {
  engine: SerpApiEngine;
  query: string;
  raw: unknown;
  hits: SerpApiRawHit[];
  resultCount: number;
  error: string | null;
}

export interface TrendsPoint {
  date: string;
  value: number;
}

export interface TrendsPayload {
  query: string;
  points: TrendsPoint[];
  average: number | null;
}
