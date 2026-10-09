import { describe, expect, it } from "vitest";
import { computeIndicators, to100 } from "../src/scoring/integrity.js";
import type { Claim, Evidence } from "@ecotrace/shared";

function claim(over: Partial<Claim> = {}): Claim {
  return {
    id: "c1",
    auditId: "a1",
    text: "We use 100% recycled materials.",
    category: "RECYCLING",
    sourceUrl: null,
    sourceName: null,
    discoveredAt: new Date().toISOString(),
    claimDate: null,
    specificityScore: 0.8,
    importanceScore: 0.9,
    status: "PENDING",
    integrityScore: null,
    explanation: null,
    ...over,
  };
}

function ev(over: Partial<Evidence>): Evidence {
  return {
    id: "e",
    subclaimId: "s",
    claimId: "c1",
    title: "t",
    url: "https://x.example",
    domain: "x.example",
    snippet: "s",
    sourceName: "n",
    publishedAt: new Date().toISOString(),
    retrievedAt: new Date().toISOString(),
    engine: "google",
    sourceType: "NEWS",
    relation: "SUPPORTING",
    relevanceScore: 0.8,
    independenceScore: 0.8,
    freshnessScore: 0.9,
    freshnessBand: "FRESH",
    explanation: "ok",
    clusterId: null,
    ...over,
  };
}

describe("integrity scoring", () => {
  it("stays within 0-100", () => {
    const ind = computeIndicators(claim(), [
      ev({ id: "1", sourceType: "NEWS" }),
      ev({ id: "2", relation: "CONTRADICTING", sourceType: "NGO", domain: "ngo.example" }),
    ], ["gap"]);
    for (const v of Object.values(ind)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it("to100 clamps", () => {
    expect(to100(1.4)).toBe(100);
    expect(to100(-2)).toBe(0);
  });
});
