import { describe, expect, it } from "vitest";
import { validateClaimCandidate, sanitizeClaimText } from "../src/analysis/claimValidator.js";

describe("claim-validation stage", () => {
  it("rejects interrogatives and survey questions", () => {
    const res = validateClaimCandidate(
      "What are your thoughts on IKEA's sustainability efforts?",
      "IKEA",
      "https://facebook.com/groups/post/123",
      "Facebook Forum",
    );
    expect(res.isValid).toBe(false);
    expect(res.rejectionReason).toContain("Interrogative questions");
  });

  it("rejects website navigation labels and breadcrumbs", () => {
    const res = validateClaimCandidate(
      "Sustainability stories – IKEA Global.",
      "IKEA",
      "https://ikea.com/global/en/stories/sustainability",
      "IKEA",
    );
    expect(res.isValid).toBe(false);
    expect(res.rejectionReason).toContain("navigation labels");
  });

  it("rejects generic promotional headlines lacking testable propositions", () => {
    const res = validateClaimCandidate(
      "Why Ingka Group is a Sustainability Leader.",
      "IKEA",
      "https://sustainabilitymag.com/news/article",
      "Sustainability Magazine",
    );
    expect(res.isValid).toBe(false);
    expect(res.rejectionReason).toBeTruthy();
  });

  it("rejects incomplete allegations and dangling prepositions", () => {
    const res = validateClaimCandidate(
      "Ikea's main supplier in Brazil accused of environmental .",
      "IKEA",
      "https://disclose.ngo/article/1",
      "Disclose.ngo",
    );
    expect(res.isValid).toBe(false);
    expect(res.rejectionReason).toContain("Sentence fragment with incomplete proposition");
  });

  it("accepts substantive, testable environmental propositions", () => {
    const res = validateClaimCandidate(
      "Ingka Group aims to halve its greenhouse gas emissions by 2030 and reach net zero by 2050.",
      "IKEA",
      "https://sustainabilitymag.com/news/article",
      "Sustainability Magazine",
    );
    expect(res.isValid).toBe(true);
    expect(res.category).toBe("CARBON");
    expect(res.specificityScore).toBeGreaterThan(0.5);
    expect(res.hasMetrics).toBe(true);
    expect(res.hasTemporalScope).toBe(true);
  });

  it("sanitizes double company prefixes", () => {
    expect(sanitizeClaimText("IKEA: IKEA: We reduced emissions by 40%", "IKEA")).toBe(
      "We reduced emissions by 40%",
    );
    expect(sanitizeClaimText("Nike - Nike: 100% recycled polyester", "Nike")).toBe(
      "100% recycled polyester",
    );
  });

  it("identifies corporate vs independent reporting vs scientific provenance", () => {
    const corp = validateClaimCandidate(
      "We target 100% renewable electricity across all operations by 2030.",
      "Demo Corp",
      "https://demo.example/report",
      "Demo Corp Official",
    );
    expect(corp.claimantType).toBe("CORPORATE_OFFICIAL");

    const news = validateClaimCandidate(
      "Regulators launched a formal investigation into Demo Corp's packaging emissions claims.",
      "Demo Corp",
      "https://reuters.com/article/probe",
      "Reuters",
    );
    expect(news.claimantType).toBe("INDEPENDENT_REPORTING");

    const science = validateClaimCandidate(
      "Life-cycle assessments demonstrate recycled polyester reduces energy consumption by 30%.",
      "Demo Corp",
      "https://scholar.example/article",
      "Journal of Industrial Ecology",
    );
    expect(science.claimantType).toBe("SCIENTIFIC");
  });
});
