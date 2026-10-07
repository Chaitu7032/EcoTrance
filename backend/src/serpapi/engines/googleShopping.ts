import type { SerpApiRawHit } from "../SerpApiTypes.js";

export const GOOGLE_SHOPPING_ENGINE = "google_shopping" as const;

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

export function extractGoogleShoppingHits(raw: unknown): SerpApiRawHit[] {
  const data = asRecord(raw);
  const rows = Array.isArray(data.shopping_results) ? data.shopping_results : [];
  const hits: SerpApiRawHit[] = [];
  for (const item of rows) {
    const r = asRecord(item);
    const url = String(r.product_link ?? r.link ?? "");
    if (!url) continue;
    const snippetParts = [
      r.snippet,
      r.source,
      Array.isArray(r.extensions) ? r.extensions.join(", ") : "",
      r.title,
    ]
      .filter(Boolean)
      .map(String);
    hits.push({
      title: String(r.title ?? ""),
      url,
      snippet: snippetParts.join(" — "),
      sourceName: String(r.source ?? r.seller ?? "Shopping"),
      publishedAt: null,
      metadata: {
        price: r.price,
        extracted_price: r.extracted_price,
        seller: r.source,
        rating: r.rating,
        productType: "listing",
      },
    });
  }
  return hits;
}
