import type { SerpApiRawHit } from "../SerpApiTypes.js";

export const GOOGLE_SCHOLAR_ENGINE = "google_scholar" as const;

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

export function extractGoogleScholarHits(raw: unknown): SerpApiRawHit[] {
  const data = asRecord(raw);
  const rows = Array.isArray(data.organic_results) ? data.organic_results : [];
  const hits: SerpApiRawHit[] = [];
  for (const item of rows) {
    const r = asRecord(item);
    const pub = asRecord(r.publication_info);
    const resources = Array.isArray(r.resources) ? r.resources : [];
    const firstResource = resources.length ? asRecord(resources[0]) : {};
    const url = String(r.link ?? firstResource.link ?? "");
    if (!url) continue;
    hits.push({
      title: String(r.title ?? ""),
      url,
      snippet: String(r.snippet ?? ""),
      sourceName: String(pub.summary ?? "Google Scholar"),
      publishedAt: extractYear(String(pub.summary ?? r.year ?? "")),
      metadata: {
        citedBy: asRecord(r.inline_links).cited_by,
        type: "scientific",
      },
    });
  }
  return hits;
}

function extractYear(text: string): string | null {
  const m = text.match(/\b(19|20)\d{2}\b/);
  return m ? `${m[0]}-01-01` : null;
}
