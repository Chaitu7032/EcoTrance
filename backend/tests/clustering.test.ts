import { describe, expect, it } from "vitest";
import { clusterSources, jaccard } from "../src/analysis/clustering.js";
import type { EvidenceSource } from "@ecotrace/shared";

function src(id: string, url: string, title: string): EvidenceSource {
  return {
    id,
    title,
    url,
    snippet: title,
    sourceName: "n",
    publishedAt: null,
    retrievedAt: new Date().toISOString(),
    engine: "google",
    query: "q",
    domain: new URL(url).hostname,
    sourceType: "NEWS",
    metadata: {},
  };
}

describe("source clustering", () => {
  it("clusters syndicated repeated wording", () => {
    const map = clusterSources([
      src("1", "https://demo.example/press", "Demo Corporation uses 100% recycled materials in selected products"),
      src("2", "https://yahoo.example/demo", "Demo Corporation uses 100% recycled materials in selected products"),
    ]);
    const a = map.get("1")!;
    const b = map.get("2")!;
    expect(a.clusterId).toBe(b.clusterId);
  });

  it("jaccard is 1 for identical text", () => {
    expect(jaccard("recycled polyester lifecycle", "recycled polyester lifecycle")).toBe(1);
  });
});
