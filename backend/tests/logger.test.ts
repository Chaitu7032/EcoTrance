import { describe, expect, it } from "vitest";
import { sanitizeForLog } from "../src/utils/logger.js";

describe("log redaction", () => {
  it("never echoes api keys from objects", () => {
    const out = sanitizeForLog({ SERPAPI_KEY: "secret-key-value", query: "nike" }) as Record<string, unknown>;
    expect(JSON.stringify(out)).not.toContain("secret-key-value");
    expect(out.SERPAPI_KEY).toBe("[redacted]");
  });
});
