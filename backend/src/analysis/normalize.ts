import { randomUUID } from "node:crypto";
import type { EvidenceSource, SearchEngine } from "@ecotrace/shared";
import type { SerpApiRawHit } from "../serpapi/SerpApiTypes.js";
import { canonicalizeUrl, extractDomain, isSafeHttpUrl } from "../utils/url.js";
import { classifySourceType } from "./sourceType.js";

export function hitsToSources(opts: {
  hits: SerpApiRawHit[];
  engine: SearchEngine;
  query: string;
  companyDomain?: string | null;
  companyName?: string;
}): EvidenceSource[] {
  const seen = new Set<string>();
  const out: EvidenceSource[] = [];
  for (const hit of opts.hits) {
    if (!isSafeHttpUrl(hit.url)) continue;
    const url = canonicalizeUrl(hit.url);
    if (seen.has(url)) continue;
    seen.add(url);
    const domain = extractDomain(url);
    if (!domain) continue;
    if (isObviouslyIrrelevant(hit, opts.companyName)) continue;
    const sourceType = classifySourceType({
      domain,
      engine: opts.engine,
      companyDomain: opts.companyDomain,
      title: hit.title,
    });
    out.push({
      id: randomUUID(),
      title: hit.title || domain,
      url,
      snippet: String(hit.snippet || "").slice(0, 800),
      sourceName: hit.sourceName || domain,
      publishedAt: hit.publishedAt,
      retrievedAt: new Date().toISOString(),
      engine: opts.engine,
      query: opts.query,
      domain,
      sourceType,
      metadata: hit.metadata,
    });
  }
  return out;
}

function isObviouslyIrrelevant(hit: SerpApiRawHit, companyName?: string): boolean {
  const blob = `${hit.title} ${hit.snippet}`.toLowerCase();
  if (!companyName) return false;
  const name = companyName.toLowerCase();
  const tokens = name.split(/\s+/).filter((t) => t.length > 2);
  if (tokens.length && !tokens.some((t) => blob.includes(t)) && !blob.includes(name)) {
    if (!/(sustainab|environment|recycl|carbon|emission|climate|packag)/.test(blob)) {
      return true;
    }
  }
  return false;
}
