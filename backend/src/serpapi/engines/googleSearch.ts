import type { SerpApiRawHit } from "../SerpApiTypes.js";

export const GOOGLE_SEARCH_ENGINE = "google" as const;

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

export function extractGoogleSearchHits(raw: unknown): SerpApiRawHit[] {
  const data = asRecord(raw);
  const hits: SerpApiRawHit[] = [];
  const organic = Array.isArray(data.organic_results) ? data.organic_results : [];
  for (const item of organic) {
    const r = asRecord(item);
    const url = String(r.link ?? r.redirect_link ?? "");
    if (!url) continue;
    hits.push({
      title: String(r.title ?? ""),
      url,
      snippet: String(r.snippet ?? r.snippet_highlighted_words ?? ""),
      sourceName: String(r.source ?? r.displayed_link ?? ""),
      publishedAt: r.date ? String(r.date) : null,
      metadata: { position: r.position, displayed_link: r.displayed_link },
    });
  }
  const kg = asRecord(data.knowledge_graph);
  if (kg.title && (kg.source || kg.knowledge_graph_search_link)) {
    const source = asRecord(kg.source);
    hits.unshift({
      title: String(kg.title),
      url: String(source.link ?? kg.website ?? ""),
      snippet: String(kg.description ?? ""),
      sourceName: String(source.name ?? "Knowledge Graph"),
      publishedAt: null,
      metadata: { knowledgeGraph: true, type: kg.type },
    });
  }
  return hits.filter((h) => h.url);
}
