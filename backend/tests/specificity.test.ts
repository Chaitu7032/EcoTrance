import { describe, expect, it } from "vitest";
import { calculateSpecificity } from "../src/scoring/specificity.js";

describe("deterministic specificity", () => {
  it("ranks quantified dated claims above vague claims", () => {
    expect(calculateSpecificity("Acme is sustainable")).toBeLessThan(
      calculateSpecificity("Acme FY24 climate footprint was 21.3 million tonnes, down 5%"),
    );
  });

  it("handles scope and targets without exceeding one", () => {
    const score = calculateSpecificity("Brand will use 100% recycled polyester in Europe by 2030");
    expect(score).toBeGreaterThan(0.5);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("returns zero for questions and forum queries", () => {
    expect(calculateSpecificity("What are your thoughts on sustainability efforts?")).toBe(0);
    expect(calculateSpecificity("How sustainable is the brand?")).toBe(0);
  });

  it("returns zero for empty or trivial strings", () => {
    expect(calculateSpecificity("")).toBe(0);
    expect(calculateSpecificity("   ")).toBe(0);
    expect(calculateSpecificity("overview")).toBe(0);
  });

  it("functions generically without hardcoded company names", () => {
    const generic = calculateSpecificity("SolarCo reduced Scope 1 emissions by 40% across European facilities by 2025");
    expect(generic).toBeGreaterThan(0.6);
  });
});
