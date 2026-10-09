import { describe, expect, it } from "vitest";
import { determineClaimStatus } from "../src/analysis/statusRules.js";

describe("partial audits", () => {
  it("still yields a status when some engines are missing", () => {
    expect(determineClaimStatus([])).toBe("INSUFFICIENT_EVIDENCE");
  });
});
