import type { SerpApiRawHit, TrendsPayload } from "../SerpApiTypes.js";

export const GOOGLE_TRENDS_ENGINE = "google_trends" as const;

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

export function extractGoogleTrends(raw: unknown, query: string): TrendsPayload {
  const data = asRecord(raw);
  const interest = asRecord(data.interest_over_time);
  const timeline = Array.isArray(interest.timeline_data) ? interest.timeline_data : [];
  const points = timeline.map((row) => {
    const r = asRecord(row);
    const values = Array.isArray(r.values) ? r.values : [];
    const first = asRecord(values[0]);
    const extracted = Number(first.extracted_value ?? first.value ?? 0);
    return { date: String(r.date ?? r.timestamp ?? ""), value: Number.isFinite(extracted) ? extracted : 0 };
  });
  const avg =
    points.length > 0 ? points.reduce((s, p) => s + p.value, 0) / points.length : null;
  return { query, points, average: avg };
}

export function extractGoogleTrendsHits(raw: unknown, query: string): SerpApiRawHit[] {
  const payload = extractGoogleTrends(raw, query);
  if (!payload.points.length) return [];
  const peak = payload.points.reduce((a, b) => (a.value > b.value ? a : b), payload.points[0]);
  return [
    {
      title: `Public search interest: ${query}`,
      url: `https://trends.google.com/trends/explore?q=${encodeURIComponent(query)}`,
      snippet: `Average interest ${payload.average?.toFixed(1) ?? "n/a"}; peak ${peak.value} on ${peak.date}. This is public search interest, not proof of environmental performance.`,
      sourceName: "Google Trends",
      publishedAt: null,
      metadata: { trends: payload, signal: "public_attention" },
    },
  ];
}
