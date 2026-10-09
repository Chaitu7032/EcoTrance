import type { SerpApiRawHit } from "../SerpApiTypes.js";

export const GOOGLE_PATENTS_ENGINE = "google_patents" as const;

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/**
 * Extracts patent filings from Google Patents API responses.
 * Patent filings are verifiable hard evidence of R&D investment.
 * A company claiming innovation with zero relevant patents is a gap signal.
 * A company with active patent filings matching claimed technology is strong support.
 */
export function extractGooglePatentsHits(raw: unknown): SerpApiRawHit[] {
  const data = asRecord(raw);
  const hits: SerpApiRawHit[] = [];

  const results = asArray(data.organic_results);
  for (const item of results) {
    const r = asRecord(item);
    const url = String(r.patent_link ?? r.link ?? r.pdf ?? "");
    if (!url) continue;

    const assignee = String(r.assignee ?? r.inventor ?? "");
    const abstract = String(r.snippet ?? r.abstract ?? r.description ?? "");
    const filingDate = r.filing_date ? String(r.filing_date) : r.priority_date ? String(r.priority_date) : null;

    hits.push({
      title: String(r.title ?? ""),
      url,
      snippet: abstract.slice(0, 800),
      sourceName: assignee ? `Patent — ${assignee}` : "Google Patents",
      publishedAt: filingDate,
      metadata: {
        type: "patent",
        patentId: r.patent_id ?? r.id,
        assignee,
        filingDate,
        publicationDate: r.publication_date,
        status: r.status,
        inventor: r.inventor,
        countryCode: r.country_code,
      },
    });
  }

  return hits.filter((h) => h.url);
}
