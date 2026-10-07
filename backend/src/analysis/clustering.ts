import type { EvidenceSource, SourceCluster } from "@ecotrace/shared";
import { canonicalizeUrl, extractDomain } from "../utils/url.js";

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );
}

export function jaccard(a: string, b: string): number {
  const A = tokenize(a);
  const B = tokenize(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

export function clusterSources(sources: EvidenceSource[]): Map<string, SourceCluster> {
  const clusters: SourceCluster[] = [];
  const assigned = new Map<string, string>();

  for (const src of sources) {
    const url = canonicalizeUrl(src.url);
    const domain = extractDomain(src.url) || src.domain;
    let matched: SourceCluster | undefined;
    for (const c of clusters) {
      const sameUrl = c.canonicalSource === url;
      const similar =
        jaccard(c.canonicalSource + c.domains.join(" "), src.title + " " + src.snippet) > 0.62;
      const syndicated = c.domains.includes(domain) && similar;
      if (sameUrl || syndicated || similar) {
        matched = c;
        break;
      }
    }
    if (!matched) {
      matched = {
        clusterId: `cluster_${clusters.length + 1}`,
        canonicalSource: url,
        domains: [domain],
        similarity: 1,
        independenceScore: 1,
      };
      clusters.push(matched);
    } else {
      if (!matched.domains.includes(domain)) matched.domains.push(domain);
      matched.similarity = Math.max(matched.similarity, jaccard(matched.canonicalSource, src.title));
    }
    assigned.set(src.id, matched.clusterId);
  }

  for (const c of clusters) {
    const uniquePublishers = new Set(c.domains).size;
    c.independenceScore = uniquePublishers <= 1 ? 1 : 1 / Math.sqrt(c.domains.length);
  }

  const map = new Map<string, SourceCluster>();
  for (const src of sources) {
    const id = assigned.get(src.id);
    const c = clusters.find((x) => x.clusterId === id);
    if (c) map.set(src.id, c);
  }
  return map;
}
