import type { SerpApiRawHit } from "../SerpApiTypes.js";

export const YOUTUBE_ENGINE = "youtube" as const;

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/**
 * Extracts sustainability-relevant content from YouTube search results and video transcripts.
 * Companies publish sustainability report walkthroughs, CEO climate pledges, and ESG
 * press conferences on YouTube. These are high-value primary source claims — spoken by
 * executives and attributable to the company — that no other engine surface captures.
 *
 * Response shape: YouTube Search API returns video_results.
 * YouTube Video Transcript API returns transcript segments.
 * This extractor handles both shapes.
 */
export function extractYoutubeTranscriptHits(raw: unknown): SerpApiRawHit[] {
  const data = asRecord(raw);
  const hits: SerpApiRawHit[] = [];

  // Shape 1: YouTube Search API — video_results array
  const videoResults = asArray(data.video_results);
  for (const item of videoResults) {
    const r = asRecord(item);
    const videoId = String(r.id ?? "");
    if (!videoId) continue;

    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const channel = asRecord(r.channel);
    const channelName = String(channel.name ?? r.channel_name ?? "YouTube");
    const duration = r.duration ? ` [${r.duration}]` : "";
    const views = r.views ? ` · ${r.views} views` : "";

    hits.push({
      title: String(r.title ?? ""),
      url,
      snippet: (String(r.description ?? r.snippet ?? "") + duration + views).slice(0, 800),
      sourceName: `YouTube — ${channelName}`,
      publishedAt: r.published_date ? String(r.published_date) : null,
      metadata: {
        type: "video_transcript",
        videoId,
        channel: channelName,
        duration: r.duration,
        views: r.views,
        thumbnail: r.thumbnail,
      },
    });
  }

  // Shape 2: YouTube Video Transcript API — transcript array with text segments
  const transcript = asArray(data.transcript);
  if (transcript.length > 0) {
    // Concatenate transcript segments into meaningful chunks
    const fullText = transcript
      .map((seg) => {
        const s = asRecord(seg);
        return String(s.text ?? s.line ?? "").trim();
      })
      .filter(Boolean)
      .join(" ");

    // Extract only sustainability-relevant sentences from the transcript
    const sustainabilitySnippet = extractSustainabilitySentences(fullText);

    if (sustainabilitySnippet) {
      const searchMeta = asRecord(data.search_metadata);
      const videoUrl = String(searchMeta.id ? `https://www.youtube.com/watch?v=${searchMeta.id}` : "");

      hits.push({
        title: String(data.title ?? "Video Transcript"),
        url: videoUrl || "https://www.youtube.com",
        snippet: sustainabilitySnippet.slice(0, 800),
        sourceName: "YouTube Video Transcript",
        publishedAt: null,
        metadata: {
          type: "video_transcript",
          transcriptSegments: transcript.length,
          fullTranscriptLength: fullText.length,
        },
      });
    }
  }

  // Shape 3: Fallback organic results (some YouTube search responses)
  if (!hits.length) {
    const organic = asArray(data.organic_results);
    for (const item of organic) {
      const r = asRecord(item);
      const url = String(r.link ?? r.url ?? "");
      if (!url) continue;
      hits.push({
        title: String(r.title ?? ""),
        url,
        snippet: String(r.snippet ?? "").slice(0, 800),
        sourceName: "YouTube",
        publishedAt: null,
        metadata: { type: "video_transcript" },
      });
    }
  }

  return hits.filter((h) => h.url);
}

/**
 * Extracts sustainability-relevant sentences from a transcript.
 * Filters for sentences mentioning environmental topics to avoid noise.
 */
function extractSustainabilitySentences(text: string): string {
  const SUSTAINABILITY_PATTERN =
    /\b(?:carbon|emission|net.?zero|renewable|recycl|sustainab|climate|environmental|packaging|waste|energy|biodiversity|supply chain|scope [123]|greenhouse|fossil|circular)\b/i;

  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20 && SUSTAINABILITY_PATTERN.test(s));

  return sentences.slice(0, 8).join(" ");
}
