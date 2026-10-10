import { describe, expect, it } from "vitest";
import { checkEntityMatch, checkPropositionMatch } from "../src/analysis/evidenceMatcher.js";
import { heuristicRelation, heuristicSubclaims } from "../src/llm/LlmClient.js";
import { determineClaimStatus } from "../src/analysis/statusRules.js";
import { computeIndicators, aggregateMetrics } from "../src/scoring/integrity.js";
import { detectGaps } from "../src/analysis/gaps.js";
import { renderExport } from "../src/services/AuditOrchestrator.js";
import { creditManager } from "../src/services/CreditManager.js";
import type { AuditBundle } from "../src/repositories/Store.js";
import type { Claim, Evidence, Subclaim } from "@ecotrace/shared";

function mockClaim(over: Partial<Claim> = {}): Claim {
  return {
    id: "cl-1",
    auditId: "aud-1",
    text: "Tata Power aims to reduce Scope 1 greenhouse gas emissions by 70.5% per MWh by FY2037 from an FY2022 baseline.",
    category: "CARBON",
    sourceUrl: "https://tatapower.example/sustainability",
    sourceName: "Tata Power Sustainability Report",
    discoveredAt: "2026-03-01T00:00:00.000Z",
    claimDate: "2024-03-31",
    specificityScore: 0.85,
    importanceScore: 0.9,
    status: "PENDING",
    integrityScore: null,
    explanation: null,
    ...over,
  };
}

function mockEvidence(over: Partial<Evidence> = {}): Evidence {
  return {
    id: "ev-1",
    subclaimId: "sub-1",
    claimId: "cl-1",
    title: "Tata Power Sustainability Disclosures",
    url: "https://tatapower.example/emissions",
    domain: "tatapower.example",
    snippet: "Tata Power committed to a 70.5% reduction in Scope 1 emissions intensity by FY2037.",
    sourceName: "Tata Power",
    publishedAt: "2024-06-01",
    retrievedAt: "2026-03-01T00:00:00.000Z",
    engine: "google",
    sourceType: "OFFICIAL_COMPANY",
    relation: "SUPPORTING",
    relevanceScore: 0.8,
    independenceScore: 0.15,
    freshnessScore: 0.8,
    freshnessBand: "RECENT",
    explanation: "Documents the official commitment.",
    clusterId: "clst-1",
    ...over,
  };
}

describe("Master Regression Test Suite — Verification & Stabilization Cases", () => {
  // Case A — Wrong-company evidence
  describe("Case A — Wrong-company evidence", () => {
    it("rejects evidence from sister company (Tata Motors on Tata Power claim) as IRRELEVANT", () => {
      const match = checkEntityMatch(
        "Tata Power",
        "TCS Partners with Tata Motors to Power Future-Ready Sustainability Reporting and Reduce Environmental Impact",
        "Tata Motors has partnered with Tata Consultancy Services to accelerate carbon reporting across its passenger vehicles division.",
      );
      expect(match.matches).toBe(false);
      expect(match.reason).toContain("TATA MOTORS");

      const relation = heuristicRelation({
        claim: "Tata Power: Scope 1 emissions reduction target",
        title: "TCS Partners with Tata Motors to Power Future-Ready Sustainability Reporting and Reduce Environmental Impact",
        snippet: "Tata Motors partners with TCS to power reporting.",
        sourceType: "NEWS",
        companyName: "Tata Power",
      });
      expect(relation.relation).toBe("IRRELEVANT");
    });

    it("rejects Company B evidence when evaluating Company A", () => {
      const match = checkEntityMatch(
        "Acme Solar",
        "Beta Industries achieves 50% emissions reduction",
        "Beta Industries reduced scope 1 emissions in Europe.",
      );
      expect(match.matches).toBe(false);
      expect(match.reason).toContain("Acme Solar");
    });
  });

  // Case B — Promotional language
  describe("Case B — Promotional language", () => {
    it("distinguishes company promotional marketing from independent corroboration", () => {
      const propMatch = checkPropositionMatch(
        "Company says its products promote sustainability",
        "Our Approach — Committed to Sustainability",
        "We are proud to support sustainability across our operations and lead the way forward.",
        "OFFICIAL_COMPANY",
      );
      // Pure marketing repetition is insufficient proof
      expect(propMatch.relation).toBe("INSUFFICIENT");

      // Even if official company disclosure supports a claim, verdict is PARTIALLY_SUPPORTED without independent sources
      const status = determineClaimStatus([
        mockEvidence({ sourceType: "OFFICIAL_COMPANY", relation: "SUPPORTING", independenceScore: 0.15 }),
      ]);
      expect(status).toBe("PARTIALLY_SUPPORTED");
    });
  });

  // Case C — Duplicate evidence
  describe("Case C — Duplicate evidence", () => {
    it("duplicate evidence records sharing same cluster/URL do not artificially inflate coverage or independence", () => {
      const c = mockClaim();
      const singleEv = [
        mockEvidence({ id: "e1", clusterId: "cluster-syndicated", url: "https://news.example/article1", relation: "SUPPORTING", sourceType: "NEWS", independenceScore: 0.7 }),
      ];
      const dupEv = [
        mockEvidence({ id: "e1", clusterId: "cluster-syndicated", url: "https://news.example/article1", relation: "SUPPORTING", sourceType: "NEWS", independenceScore: 0.7 }),
        mockEvidence({ id: "e2", clusterId: "cluster-syndicated", url: "https://news.example/article1-duplicate", relation: "SUPPORTING", sourceType: "NEWS", independenceScore: 0.7 }),
        mockEvidence({ id: "e3", clusterId: "cluster-syndicated", url: "https://wire.example/repost", relation: "SUPPORTING", sourceType: "NEWS", independenceScore: 0.7 }),
      ];

      const scoreSingle = computeIndicators(c, singleEv, []);
      const scoreDup = computeIndicators(c, dupEv, []);

      // Duplicate records must produce identical coverage and independence
      expect(scoreDup.evidenceCoverage).toBe(scoreSingle.evidenceCoverage);
      expect(scoreDup.sourceIndependence).toBe(scoreSingle.sourceIndependence);
    });
  });

  // Case D — Relevant supporting evidence
  describe("Case D — Relevant supporting evidence", () => {
    it("authoritative company disclosure substantiates target announcement, yielding PARTIALLY_SUPPORTED rather than uncorroborated SUPPORTED", () => {
      const c = mockClaim({ text: "Tata Power announced a target to achieve net-zero GHG emissions by 2045." });
      const ev = [
        mockEvidence({
          sourceType: "OFFICIAL_COMPANY",
          title: "Tata Power Integrated Annual Report",
          snippet: "Tata Power has announced its vision to become net-zero by 2045.",
          relation: "SUPPORTING",
          independenceScore: 0.15,
        }),
      ];
      const status = determineClaimStatus(ev);
      expect(status).toBe("PARTIALLY_SUPPORTED");

      const indicators = computeIndicators(c, ev, []);
      expect(indicators.integrity).toBeGreaterThan(0);

      // With an independent NGO audit/filing, it reaches SUPPORTED
      const independentEv = [
        ...ev,
        mockEvidence({
          id: "ev-2",
          sourceType: "NGO",
          domain: "cdp.net",
          title: "CDP Climate Disclosure Verification",
          snippet: "CDP verified Tata Power's 2045 net-zero emissions target commitment.",
          relation: "SUPPORTING",
          independenceScore: 0.85,
        }),
      ];
      const verifiedStatus = determineClaimStatus(independentEv);
      expect(verifiedStatus).toBe("SUPPORTED");
    });
  });

  // Case E — Conflicting evidence
  describe("Case E — Conflicting evidence", () => {
    it("credible conflicting source sets relation to CONTRADICTING and verdict to EVIDENCE_CONFLICT", () => {
      const match = checkPropositionMatch(
        "Company uses 100% recycled polyester in its product line",
        "Independent Product Testing Report",
        "Independent lab testing found selected apparel contained only 70% recycled polyester, and critics questioned the 100% claim as misleading.",
        "NEWS",
      );
      expect(match.relation).toBe("CONTRADICTING");

      const status = determineClaimStatus([
        mockEvidence({ relation: "SUPPORTING", sourceType: "OFFICIAL_COMPANY" }),
        mockEvidence({ relation: "CONTRADICTING", sourceType: "NEWS", independenceScore: 0.8 }),
      ]);
      expect(status).toBe("EVIDENCE_CONFLICT");
    });
  });

  // Case F — Search failure
  describe("Case F — Search failure", () => {
    it("search errors or timeouts contribute zero evidence weight and do not become false conflicts or supports", () => {
      // Empty or timed-out retrieval leaves evidence array empty
      const emptyEv: Evidence[] = [];
      const status = determineClaimStatus(emptyEv);
      expect(status).toBe("INSUFFICIENT_EVIDENCE");

      const c = mockClaim();
      const indicators = computeIndicators(c, emptyEv, ["No retrieved sources"]);
      expect(indicators.evidenceCoverage).toBe(0);
      expect(indicators.sourceIndependence).toBe(0);
      expect(indicators.evidenceConflict).toBe(0);
      expect(indicators.evidenceGap).toBe(100);
    });
  });

  // Case G — Broad or vague claim
  describe("Case G — Broad or vague claim", () => {
    it("thematic headlines lacking specific factual propositions are classified as INSUFFICIENT", () => {
      const propMatch = checkPropositionMatch(
        "Sustainable AI and its potential for net-zero sustainability",
        "AI for Sustainability",
        "Discussion on how artificial intelligence and machine learning may help reduce data center energy consumption.",
        "NEWS",
      );
      expect(propMatch.relation).toBe("INSUFFICIENT");
    });
  });

  // Case H — Inapplicable evidence gap
  describe("Case H — Inapplicable evidence gap", () => {
    it("does not demand an emissions baseline for a descriptive energy services offering", () => {
      const c = mockClaim({
        text: "Tata Power offers wind, solar, hydro and thermal energy services to reduce emissions.",
      });
      const subclaims: Subclaim[] = [
        { id: "s1", claimId: c.id, text: "Tata Power offers wind, solar, hydro and thermal energy services.", testQuestion: "Does company offer services?", category: "ENERGY", status: "SUPPORTED" },
        { id: "s2", claimId: c.id, text: "Those activities reduce emissions in the relevant operational context.", testQuestion: "Do services reduce emissions?", category: "ENERGY", status: "PARTIALLY_SUPPORTED" },
      ];
      const ev = [
        mockEvidence({
          relation: "SUPPORTING",
          title: "Tata Power Clean Energy Solutions",
          snippet: "Tata Power provides rooftop solar, utility wind, and hydroelectric generation services across India.",
        }),
      ];
      const gaps = detectGaps(c, subclaims, ev);

      // Must NOT demand a baseline year when no comparative percentage was asserted
      expect(gaps.missing.some((m) => m.toLowerCase().includes("baseline year"))).toBe(false);
      // Must NOT demand scientific literature for a commercial service announcement
      expect(gaps.missing.some((m) => m.toLowerCase().includes("scientific or lifecycle"))).toBe(false);
    });
  });

  // Case I — Empty and malformed data
  describe("Case I — Empty and malformed data", () => {
    it("handles zero evidence, malformed scores, and empty lists safely without NaN or crash", () => {
      const c = mockClaim({ specificityScore: 0 });
      const indicators = computeIndicators(c, [], []);
      expect(Number.isFinite(indicators.integrity)).toBe(true);
      expect(Number.isNaN(indicators.integrity)).toBe(false);
      expect(indicators.integrity).toBeGreaterThanOrEqual(0);
      expect(indicators.integrity).toBeLessThanOrEqual(100);

      const metrics = aggregateMetrics("empty-audit", [], [], [], 0, 0, 0, 0, null, 0);
      expect(metrics.claimIntegrity).toBe(0);
      expect(metrics.evidenceCoverage).toBe(0);
      expect(metrics.sourceIndependence).toBe(0);
      expect(metrics.evidenceGap).toBe(0);
    });
  });

  // Case J — UI/export consistency
  describe("Case J — UI/export consistency", () => {
    it("exported dossier contains identical verdicts, authoritative metrics, and includes atomic propositions", () => {
      const c = mockClaim({ status: "PARTIALLY_SUPPORTED", integrityScore: 69 });
      const sub: Subclaim = { id: "s1", claimId: c.id, text: "Tata Power targets 70.5% Scope 1 reduction", testQuestion: "Verified in filings?", category: "CARBON", status: "PARTIALLY_SUPPORTED" };
      const ev = mockEvidence({ claimId: c.id, subclaimId: sub.id });

      const bundle: AuditBundle = {
        audit: {
          id: "aud-test-123",
          companyId: "c-1",
          companyName: "Tata Power",
          mode: "quick",
          status: "completed",
          stage: "completed",
          mockMode: false,
          createdAt: "2026-03-01T12:00:00.000Z",
          updatedAt: "2026-03-01T12:05:00.000Z",
          completedAt: "2026-03-01T12:05:00.000Z",
          error: null,
          notes: [],
        },
        company: {
          id: "c-1",
          name: "Tata Power",
          officialDomain: "tatapower.com",
          aliases: ["Tata Power"],
          industry: "Energy",
          country: "India",
        },
        claims: [c],
        subclaims: [sub],
        evidence: [ev],
        engines: [
          { engine: "google", status: "success", error: null, retryCount: 0, requestCount: 2, resultCount: 5 },
        ],
        requests: [],
        metrics: {
          auditId: "aud-test-123",
          claimIntegrity: 69,
          evidenceCoverage: 66,
          sourceIndependence: 60,
          evidenceConflict: 0,
          evidenceFreshness: 75,
          claimSpecificity: 85,
          evidenceGap: 40,
          publicAttention: null,
          evidenceCount: 1,
          sourceCount: 1,
          claimCount: 1,
          enginesUsed: ["google"],
          requestsUsed: 2,
          requestsCached: 0,
          requestsEstimated: 6,
          remainingBudget: 6,
        },
        gaps: [{ claimId: c.id, missing: ["Independent third-party verification missing"], requiredToSubstantiate: "Requires independent assurance." }],
        events: [],
        clusters: [],
      };

      const markdown = renderExport(bundle);
      expect(markdown).toContain("**Audit Identifier:** `aud-test-123`");
      expect(markdown).toContain("Claim Integrity");
      expect(markdown).toContain("69%");
      expect(markdown).toContain("PARTIALLY_SUPPORTED");
      expect(markdown).toContain("Tata Power targets 70.5% Scope 1 reduction");
      expect(markdown).toContain("https://tatapower.example/emissions");
      expect(markdown).toContain("Disclaimer");
    });
  });

  // Case K — Budget enforcement
  describe("Case K — Budget enforcement", () => {
    it("credit manager strictly enforces search budgets and tracks cached requests without charging credits", () => {
      const snap = creditManager.initAudit("test-budget-audit", "quick");
      expect(snap.used).toBe(0);
      expect(snap.remaining).toBeGreaterThan(0);

      // Record a cached query
      creditManager.recordCached("test-budget-audit");
      const postCache = creditManager.snapshot("test-budget-audit");
      expect(postCache.cached).toBe(1);
      expect(postCache.used).toBe(0); // 0 credits charged

      // Spend 1 credit
      creditManager.spend("test-budget-audit", 1);
      const postSpend = creditManager.snapshot("test-budget-audit");
      expect(postSpend.used).toBe(1);
      expect(postSpend.remaining).toBe(snap.remaining - 1);
    });
  });

  // Case L — Deterministic scoring
  describe("Case L — Deterministic scoring", () => {
    it("produces identical scores and verdicts for identical inputs", () => {
      const c = mockClaim();
      const ev = [mockEvidence(), mockEvidence({ id: "e2", domain: "news.example", sourceType: "NEWS", independenceScore: 0.75 })];
      const gaps = ["Gap 1", "Gap 2"];

      const run1 = computeIndicators(c, ev, gaps);
      const run2 = computeIndicators(c, ev, gaps);

      expect(run1).toEqual(run2);
    });
  });

  // Atomic Subclaim Decomposition validation
  describe("Atomic Subclaim Decomposition", () => {
    it("decomposes compound statements with service offerings and environmental effects", () => {
      const parts = heuristicSubclaims(
        "Tata Power offers wind, solar, hydro and thermal energy services to reduce emissions.",
        "ENERGY",
      );
      expect(parts.length).toBe(2);
      expect(parts[0].text).toContain("Tata Power offers wind, solar, hydro and thermal energy services.");
      expect(parts[1].text).toContain("reduce emissions");
    });

    it("decomposes target with baseline into target announcement and baseline methodology propositions", () => {
      const parts = heuristicSubclaims(
        "Tata Power aims to reduce Scope 1 greenhouse gas emissions by 70.5% per MWh by FY2037 from an FY2022 baseline",
        "CARBON",
      );
      expect(parts.length).toBe(2);
      expect(parts[0].text).toContain("Scope 1 greenhouse gas emissions by 70.5% per MWh by FY2037");
      expect(parts[1].text).toContain("FY2022 baseline");
    });
  });
});
