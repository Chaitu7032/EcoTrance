import type { SerpApiRawHit } from "../SerpApiTypes.js";

export const GOOGLE_NEWS_ENGINE = "google_news" as const;

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

export function extractGoogleNewsHits(raw: unknown): SerpApiRawHit[] {
  const data = asRecord(raw);
  const rows = Array.isArray(data.news_results) ? data.news_results : [];
  const hits: SerpApiRawHit[] = [];
  for (const item of rows) {
    const r = asRecord(item);
    const source = asRecord(r.source);
    const url = String(r.link ?? "");
    if (!url) continue;
    hits.push({
      title: String(r.title ?? ""),
      url,
      snippet: String(r.snippet ?? r.title ?? ""),
      sourceName: String(source.name ?? r.source ?? ""),
      publishedAt: r.iso_date ? String(r.iso_date) : r.date ? String(r.date) : null,
      metadata: { position: r.position, authors: source.authors },
    });
  }
  return hits;
}
