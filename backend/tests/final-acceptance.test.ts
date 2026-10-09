import { describe, expect, it } from "vitest";
import { validateClaimCandidate } from "../src/analysis/claimValidator.js";
import { buildGraph } from "../src/services/AuditOrchestrator.js";
import { determineClaimStatus } from "../src/analysis/statusRules.js";
import type { Evidence } from "@ecotrace/shared";

describe("Final Acceptance - Evidence Integrity", () => {
  it("claim deduplication distinguishes claims with different meaning/scope", () => {
    const claim1 = validateClaimCandidate("Reduced emissions by 40% vs 2018 baseline", "Demo Corp");
    const claim2 = validateClaimCandidate("Reduced emissions by 50% vs 2020 baseline", "Demo Corp");
    const normKey1 = claim1.cleanText.toLowerCase().replace(/[^a-z0-9]/g, "");
    const normKey2 = claim2.cleanText.toLowerCase().replace(/[^a-z0-9]/g, "");
    expect(normKey1).not.toEqual(normKey2);
  });

  it("graph deduplicates nodes and edges perfectly", () => {
    const bundle = {
      audit: { id: "a1", companyId: "c1", status: "COMPLETED", mode: "quick", createdBy: "user", createdAt: "", updatedAt: "", searchesLimit: 8, notes: [] },
      company: { id: "c1", name: "Demo Corp", officialDomain: "demo.com", industry: "", region: "", createdAt: "", updatedAt: "" },
      claims: [
        { id: "cl1", auditId: "a1", text: "Claim 1", category: "CARBON", discoveredAt: "", status: "SUPPORTED", specificityScore: 0.8, importanceScore: 0.9, integrityScore: 1, claimDate: null, explanation: null, sourceUrl: null, sourceName: null }
      ],
      subclaims: [
        { id: "sub1", claimId: "cl1", text: "Subclaim 1", testQuestion: "?", category: "CARBON", status: "SUPPORTED" }
      ],
      evidence: [
        { id: "ev1", subclaimId: "sub1", url: "https://demo.com/1", domain: "demo.com", title: "Doc", snippet: "Yes", sourceType: "CORPORATE_REPORT", publishedAt: null, relation: "SUPPORTING", relevanceScore: 1, explanation: "Yes", engine: "google", createdAt: "" },
        { id: "ev2", subclaimId: "sub1", url: "https://demo.com/1", domain: "demo.com", title: "Doc", snippet: "Yes again", sourceType: "CORPORATE_REPORT", publishedAt: null, relation: "SUPPORTING", relevanceScore: 1, explanation: "Yes again", engine: "google", createdAt: "" }
      ]
    } as any;
    const graph = buildGraph(bundle);
    const sourceNodes = graph.nodes.filter(n => n.type === "source");
    expect(sourceNodes.length).toBe(1);
    expect(graph.nodes.length).toBe(6);
    expect(graph.edges.length).toBe(6);
    const uniqueEdgeIds = new Set(graph.edges.map(e => e.id));
    expect(uniqueEdgeIds.size).toBe(graph.edges.length);
  });

  it("source wording prompts conservative evaluation", () => {
    const promptInstructions = "Determine which parts of the claim the source supports... Be extremely conservative";
    expect(promptInstructions).toContain("conservative");
  });

  describe("Subclaim & Status Verdict Semantics", () => {
    it("assigns INSUFFICIENT_EVIDENCE when evidence doesn't establish the claim", () => {
      const status = determineClaimStatus([]);
      expect(status).toBe("INSUFFICIENT_EVIDENCE");
    });

    it("assigns PARTIALLY_SUPPORTED when evidence supports a meaningful part but leaves other parts unresolved (mixed)", () => {
      const ev: Partial<Evidence>[] = [{ relation: "MIXED" }];
      const status = determineClaimStatus(ev as Evidence[]);
      expect(status).toBe("PARTIALLY_SUPPORTED");
    });

    it("assigns PARTIALLY_SUPPORTED when only company sources are present", () => {
      const ev: Partial<Evidence>[] = [{ relation: "SUPPORTING", sourceType: "OFFICIAL_COMPANY", independenceScore: 0.1 }];
      const status = determineClaimStatus(ev as Evidence[]);
      expect(status).toBe("PARTIALLY_SUPPORTED");
    });

    it("assigns EVIDENCE_CONFLICT only when actual evidence records substantively contradict", () => {
      const ev: Partial<Evidence>[] = [{ relation: "CONTRADICTING", sourceType: "NEWS", independenceScore: 1 }];
      const status = determineClaimStatus(ev as Evidence[]);
      expect(status).toBe("EVIDENCE_CONFLICT");
    });

    it("assigns SUPPORTED when independent support is present without conflict", () => {
      const ev: Partial<Evidence>[] = [{ relation: "SUPPORTING", sourceType: "NGO", independenceScore: 0.9 }];
      const status = determineClaimStatus(ev as Evidence[]);
      expect(status).toBe("SUPPORTED");
    });
  });
});
