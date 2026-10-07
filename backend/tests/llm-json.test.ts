import { describe, expect, it } from "vitest";
import { parseRelationJson } from "../src/llm/LlmClient.js";

describe("LLM JSON validation", () => {
  it("rejects malformed payloads", () => {
    expect(() => parseRelationJson({ relation: "GREENWASHING", confidence: 2 })).toThrow(
      /malformed JSON rejected/,
    );
  });

  it("accepts valid classification", () => {
    const v = parseRelationJson({
      relation: "SUPPORTING",
      confidence: 0.4,
      reason: "snippet overlaps",
    });
    expect(v.relation).toBe("SUPPORTING");
  });
});

