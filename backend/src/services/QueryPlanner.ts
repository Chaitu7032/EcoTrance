import type { AuditMode, SearchEngine, Subclaim } from "@ecotrace/shared";

export interface PlannedQuery {
  engine: SearchEngine;
  query: string;
  purpose: string;
  claimId: string | null;
  priority: number;
}

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
  const support = `${company} ${keywords} sustainability`;
  const conflict = `${company} ${keywords} criticism`;
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

function q(engine: SearchEngine, query: string, purpose: string, priority: number): PlannedQuery {
  return { engine, query, purpose, claimId: null, priority };
}

function stripCompany(text: string, company: string): string {
  return text.replace(new RegExp(company, "ig"), "").replace(/^[:\s-]+/, "").trim();
}

function extractKeywords(text: string): string {
  const keep = text
    .toLowerCase()
    .replace(/[^a-z0-9%\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !["company", "uses", "used", "their", "this", "that", "with"].includes(w))
    .slice(0, 6);
  return keep.join(" ");
}

function scientificQuery(text: string): string {
  if (/recycl/.test(text) && /polyester|material/.test(text)) {
    return "recycled polyester environmental impact lifecycle";
  }
  if (/packag/.test(text)) return "packaging lifecycle assessment environmental impact";
  if (/emission|carbon|net-zero/.test(text)) return "corporate carbon neutrality claim verification lifecycle emissions";
  if (/renewable/.test(text)) return "corporate renewable energy claims additionality";
  return `${extractKeywords(text)} environmental impact lifecycle`;
}
