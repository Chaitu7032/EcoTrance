import { describe, expect, it } from "vitest";
import { planDiscoveryQueries, planSubclaimQueries } from "../src/services/QueryPlanner.js";

describe("query planning", () => {
  it("removes internal scoring language", () => {
    const queries = planSubclaimQueries(
      "IKEA",
      "c1",
      { id: "s1", claimId: "c1", text: "IKEA uses 40% recycled materials", testQuestion: "", category: "MATERIALS", status: "PENDING" },
      "quick",
    );
    expect(queries.every((q) => !/claim is specific|measurable quantity|evidence says|scoring/i.test(q.query))).toBe(true);
    expect(queries[0].query).toContain("recycled materials");
  });

  it("avoids redundant duplicate sustainability suffixes", () => {
    const queries = planSubclaimQueries(
      "IKEA",
      "c1",
      { id: "s1", claimId: "c1", text: "IKEA sustainability report targets net-zero emissions", testQuestion: "", category: "CARBON", status: "PENDING" },
      "quick",
    );
    expect(queries[0].query).not.toMatch(/sustainability.*sustainability/i);
  });

  it("strips question words and forum conversational phrases", () => {
    const queries = planSubclaimQueries(
      "IKEA",
      "c1",
      { id: "s1", claimId: "c1", text: "What are your thoughts on plastic packaging reduction", testQuestion: "", category: "PACKAGING", status: "PENDING" },
      "quick",
    );
    expect(queries[0].query).not.toContain("what");
    expect(queries[0].query).not.toContain("thoughts");
    expect(queries[0].query).toContain("plastic packaging reduction");
  });

  it("preserves engine limits for quick and deep modes", () => {
    const quick = planDiscoveryQueries("IKEA", "quick");
    const deep = planDiscoveryQueries("IKEA", "deep");
    expect(quick.length).toBeLessThan(deep.length);
    expect(quick.some((q) => q.engine === "google_trends")).toBe(false);
  });
});
