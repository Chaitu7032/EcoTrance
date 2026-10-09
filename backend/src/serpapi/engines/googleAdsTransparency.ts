import type { SerpApiRawHit } from "../SerpApiTypes.js";

export const GOOGLE_ADS_TRANSPARENCY_ENGINE = "google_ads_transparency" as const;

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/**
 * Extracts ad creatives from Google Ads Transparency Center API responses.
 * Each ad becomes an evidence source with sourceType AD_CLAIM.
 * This is critical for detecting greenwashing: ads making sustainability claims
 * that are not backed by independent evidence.
 */
export function extractGoogleAdsTransparencyHits(raw: unknown): SerpApiRawHit[] {
  const data = asRecord(raw);
  const hits: SerpApiRawHit[] = [];

  // Primary: ads array from transparency center
  const ads = asArray(data.ads);
  for (const item of ads) {
    const r = asRecord(item);
    const creative = asRecord(r.creative);
    const advertiser = asRecord(r.advertiser);

    // Build the ad URL — use the destination URL or the transparency center page URL
    const url = String(r.destination_url ?? r.creative_url ?? r.url ?? "");
    if (!url) continue;

    // Extract ad text: creative body text is the actual claim made in the ad
    const adText = String(creative.body ?? creative.text ?? r.ad_text ?? r.text ?? "");
    const headline = String(creative.headline ?? creative.title ?? r.headline ?? r.title ?? "");
    const advertiserName = String(advertiser.name ?? r.advertiser_name ?? "Advertiser");

    const snippet = [headline, adText].filter(Boolean).join(" — ") || `Ad from ${advertiserName}`;

    hits.push({
      title: headline || `Ad: ${advertiserName}`,
      url,
      snippet: snippet.slice(0, 800),
      sourceName: `Google Ads — ${advertiserName}`,
      publishedAt: r.first_shown_date ? String(r.first_shown_date) : r.date ? String(r.date) : null,
      metadata: {
        type: "ad_claim",
        advertiser: advertiserName,
        adId: r.ad_id ?? r.id,
        format: r.format ?? r.ad_format,
        regions: r.regions,
        impressions: r.impressions,
      },
    });
  }

  // Fallback: organic_results if ads array absent (some API response shapes)
  if (!hits.length) {
    const organic = asArray(data.organic_results);
    for (const item of organic) {
      const r = asRecord(item);
      const url = String(r.link ?? r.url ?? "");
      if (!url) continue;
      hits.push({
        title: String(r.title ?? ""),
        url,
        snippet: String(r.snippet ?? r.description ?? "").slice(0, 800),
        sourceName: "Google Ads Transparency",
        publishedAt: null,
        metadata: { type: "ad_claim" },
      });
    }
  }

  return hits.filter((h) => h.url);
}
