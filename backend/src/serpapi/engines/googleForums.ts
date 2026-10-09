import type { SerpApiRawHit } from "../SerpApiTypes.js";

export const GOOGLE_FORUMS_ENGINE = "google_forums" as const;

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/**
 * Extracts community forum discussions from Google Forums API responses.
 * Forum discussions (Reddit, Q&A sites, consumer forums) represent genuine
 * independent public opinion — high-value for the independence scoring model.
 * Consumer skepticism or validation of sustainability claims found in forums
 * adds a signal that no corporate document or news article can replicate.
 */
export function extractGoogleForumsHits(raw: unknown): SerpApiRawHit[] {
  const data = asRecord(raw);
  const hits: SerpApiRawHit[] = [];

  // Primary: forums_results key from Google Forums API
  const forums = asArray(data.forums_results);
  for (const item of forums) {
    const r = asRecord(item);
    const url = String(r.link ?? r.url ?? "");
    if (!url) continue;

    const source = asRecord(r.source);
    const sourceName = String(source.name ?? r.source_name ?? "") || deriveSourceName(url);
    const votes = r.votes !== undefined ? ` [${r.votes} votes]` : "";

    hits.push({
      title: String(r.title ?? ""),
      url,
      snippet: (String(r.snippet ?? r.text ?? "") + votes).slice(0, 800),
      sourceName,
      publishedAt: r.date ? String(r.date) : null,
      metadata: {
        type: "forum",
        platform: sourceName,
        votes: r.votes,
        answers: r.answers,
        upvoteRatio: r.upvote_ratio,
      },
    });
  }

  // Fallback: organic_results (used when forums API returns standard shape)
  if (!hits.length) {
    const organic = asArray(data.organic_results);
    for (const item of organic) {
      const r = asRecord(item);
      const url = String(r.link ?? "");
      if (!url) continue;
      hits.push({
        title: String(r.title ?? ""),
        url,
        snippet: String(r.snippet ?? "").slice(0, 800),
        sourceName: deriveSourceName(url),
        publishedAt: r.date ? String(r.date) : null,
        metadata: { type: "forum" },
      });
    }
  }

  return hits.filter((h) => h.url);
}

function deriveSourceName(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.includes("reddit")) return "Reddit";
    if (host.includes("quora")) return "Quora";
    if (host.includes("stackexchange") || host.includes("stackoverflow")) return "Stack Exchange";
    return host;
  } catch {
    return "Forum";
  }
}
