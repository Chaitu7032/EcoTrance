import { describe, expect, it } from "vitest";
import { determineClaimStatus } from "../src/analysis/statusRules.js";
import type { Evidence } from "@ecotrace/shared";

function ev(over: Partial<Evidence>): Evidence {
  return {
    id: crypto.randomUUID(),
    subclaimId: "s",
    claimId: "c",
    title: "t",
    url: "https://x.example/" + Math.random(),
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

describe("claim status rules", () => {
  it("insufficient evidence when empty", () => {
    expect(determineClaimStatus([])).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("conflict when independent support and conflict exist", () => {
    const status = determineClaimStatus([
      ev({ relation: "SUPPORTING", sourceType: "NEWS", independenceScore: 0.7 }),
      ev({ relation: "CONTRADICTING", sourceType: "NGO", independenceScore: 0.8, domain: "ngo.org" }),
    ]);
    expect(status).toBe("EVIDENCE_CONFLICT");
  });

  it("company sources are not treated as independent support for SUPPORTED", () => {
    const status = determineClaimStatus([
      ev({ relation: "SUPPORTING", sourceType: "OFFICIAL_COMPANY", independenceScore: 0.15, domain: "demo.example" }),
    ]);
    expect(status).toBe("PARTIALLY_SUPPORTED");
  });
});
