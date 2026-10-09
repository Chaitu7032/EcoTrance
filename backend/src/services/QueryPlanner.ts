import type { AuditMode, SearchEngine, Subclaim } from "@ecotrace/shared";

export interface PlannedQuery {
  engine: SearchEngine;
  query: string;
  purpose: string;
  claimId: string | null;
  priority: number;
}

const STOP_AND_GENERIC = new Set([
  "company", "uses", "used", "their", "this", "that", "with", "specific",
  "measurable", "quantity", "percentage", "volume", "certified", "share",
  "disclosed", "evidence", "claim", "claims", "what", "where", "when",
  "which", "whose", "your", "thoughts", "stories", "about", "global",
  "more", "have", "been", "from", "into", "over", "after", "through",
  "than", "were", "said", "says", "would", "could", "should", "some",
  "many", "most", "also", "into", "only", "such", "very"
]);

const ENV_TOPIC_WORDS = new Set([
  "sustainability", "sustainable", "carbon", "emissions", "emission",
  "net-zero", "climate", "energy", "renewable", "recycled", "recycling",
  "packaging", "waste", "water", "biodiversity", "deforestation"
]);

export function planDiscoveryQueries(company: string, mode: AuditMode): PlannedQuery[] {
  const web: PlannedQuery[] = [
    q("google", `${company} sustainability claims`, "discover_claims", 1),
    q("google", `${company} environmental claims`, "discover_claims", 2),
    q("google", `${company} official website`, "entity_resolution", 0),
    q("google_news", `${company} sustainability`, "discover_news", 3),
  ];
  if (mode === "deep") {
    web.push(
      q("google", `${company} carbon neutral`, "discover_claims", 4),
      q("google", `${company} sustainability criticism`, "conflict_scan", 5),
      q("google_news", `${company} environmental controversy`, "discover_news", 4),
    );
  }
  return web;
}

export function planSubclaimQueries(
  company: string,
  claimId: string,
  subclaim: Subclaim,
  mode: AuditMode,
): PlannedQuery[] {
  const core = stripCompany(subclaim.text, company);
  const keywords = extractKeywords(core);
  if (!keywords) {
    return [
      { engine: "google", query: `${company} sustainability`, purpose: "support", claimId, priority: 10 },
      { engine: "google", query: `${company} sustainability criticism`, purpose: "conflict", claimId, priority: 11 },
      { engine: "google_news", query: `${company} sustainability`, purpose: "news", claimId, priority: 12 },
    ];
  }

  // Avoid awkward query suffixes: only append "sustainability" if no environmental topic is already present
  const hasEnvTopic = keywords.split(/\s+/).some((w) => ENV_TOPIC_WORDS.has(w));
  const supportSuffix = hasEnvTopic ? "" : " sustainability";
  const support = `${company} ${keywords}${supportSuffix}`.trim();
  const conflict = `${company} ${keywords} criticism`.trim();

  const out: PlannedQuery[] = [
    { engine: "google", query: support, purpose: "support", claimId, priority: 10 },
    { engine: "google", query: conflict, purpose: "conflict", claimId, priority: 11 },
    { engine: "google_news", query: `${company} ${keywords}`, purpose: "news", claimId, priority: 12 },
  ];

  if (mode === "deep" || /recycl|packag|material|polyester|organic/i.test(subclaim.text)) {
    out.push({
      engine: "google_shopping",
      query: `${company} ${keywords}`,
      purpose: "product",
      claimId,
      priority: 13,
    });
  }

  if (mode === "deep" || /impact|emission|recycl|packag|lifecycle/i.test(subclaim.text)) {
    out.push({
      engine: "google_scholar",
      query: scientificQuery(subclaim.text),
      purpose: "science",
      claimId,
      priority: 14,
    });
  }

  return out;
}

export function planTrendQueries(company: string): PlannedQuery[] {
  return [
    q("google_trends", `${company} sustainability`, "attention", 20),
    q("google_trends", `${company} greenwashing`, "attention", 21),
  ];
}

export function planAdsTransparencyQueries(company: string): PlannedQuery[] {
  // Search the Ads Transparency Center for the company's sustainability/eco ads
  // This surfaces paid advertising claims which are the most direct form of greenwashing
  return [
    q("google_ads_transparency", `${company} sustainability`, "ads_transparency", 15),
    q("google_ads_transparency", `${company} eco friendly`, "ads_transparency", 16),
  ];
}

export function planPatentsQueries(company: string, claimText: string): PlannedQuery[] {
  // Only run for technical/material/energy claims where patents are meaningful evidence
  const keywords = extractPatentKeywords(claimText);
  return [
    q("google_patents", `${company} ${keywords} patent`, "patents", 17),
  ];
}

export function planForumsQueries(company: string): PlannedQuery[] {
  // Community discussions about the company's sustainability reputation
  // Reddit and forum threads are highly independent signals
  return [
    q("google_forums", `${company} sustainability greenwashing`, "community", 18),
    q("google_forums", `${company} environmental claims reddit`, "community", 19),
  ];
}

export function planYoutubeQueries(company: string): PlannedQuery[] {
  // Sustainability report walkthroughs and ESG presentations on YouTube
  // Executive statements are primary source attributable claims
  return [
    q("youtube", `${company} sustainability report 2024`, "video_primary", 20),
    q("youtube", `${company} ESG annual report`, "video_primary", 21),
  ];
}

function extractPatentKeywords(claimText: string): string {
  if (/recycl|polyester|material/i.test(claimText)) return "recycled materials technology";
  if (/carbon|emission|net.?zero/i.test(claimText)) return "carbon capture emissions reduction";
  if (/renewable|solar|wind|energy/i.test(claimText)) return "renewable energy technology";
  if (/packag/i.test(claimText)) return "sustainable packaging";
  if (/water/i.test(claimText)) return "water treatment purification";
  return "sustainability environmental technology";
}

function q(engine: SearchEngine, query: string, purpose: string, priority: number): PlannedQuery {
  return { engine, query, purpose, claimId: null, priority };
}

function stripCompany(text: string, company: string): string {
  const escaped = company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`\\b${escaped}\\b`, "ig"), "").replace(/^[:\s-]+/, "").trim();
}

function extractKeywords(text: string): string {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9%\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_AND_GENERIC.has(w));

  // Deduplicate consecutive or repeated words while preserving order
  const seen = new Set<string>();
  const keep: string[] = [];
  for (const w of words) {
    if (!seen.has(w)) {
      seen.add(w);
      keep.push(w);
      if (keep.length >= 6) break;
    }
  }

  return keep.join(" ").slice(0, 100).trim();
}

function scientificQuery(text: string): string {
  if (/recycl/.test(text) && /polyester|material/.test(text)) {
    return "recycled polyester environmental impact lifecycle";
  }
  if (/packag/.test(text)) return "packaging lifecycle assessment environmental impact";
  if (/emission|carbon|net-zero/.test(text)) return "corporate carbon neutrality claim verification lifecycle emissions";
  if (/renewable/.test(text)) return "corporate renewable energy claims additionality";
  const kw = extractKeywords(text);
  return `${kw ? kw + " " : ""}environmental impact lifecycle`.trim();
}
