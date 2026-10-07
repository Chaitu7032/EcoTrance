import { describe, expect, it } from "vitest";
import { CreditManager } from "../src/services/CreditManager.js";
import { QueryCache } from "../src/cache/QueryCache.js";
import { normalizeQuery } from "../src/utils/url.js";
import { canonicalizeUrl } from "../src/utils/url.js";

describe("credit manager", () => {
  it("does not spend twice for cached accounting at manager level", () => {
    const cm = new CreditManager();
    cm.initAudit("a", "quick");
    cm.spend("a", 1);
    cm.recordCached("a");
    const snap = cm.snapshot("a");
    expect(snap.used).toBe(1);
    expect(snap.cached).toBe(1);
  });

  it("blocks runaway spend", () => {
    const cm = new CreditManager();
    cm.initAudit("a", "deep");
    expect(cm.canSpend("a", 5000)).toBe(false);
  });

  it("caps a many-claim quick audit at eight external searches", () => {
    const cm = new CreditManager();
    cm.initAudit("many-claims", "quick");
    // Regression model for the previous ~27-request scenario: many planned
    // claim searches must stop at the server-side audit limit.
    for (let i = 0; i < 8; i++) cm.spend("many-claims");
    expect(cm.snapshot("many-claims").used).toBe(8);
    expect(cm.canSpend("many-claims")).toBe(false);
    expect(() => cm.spend("many-claims")).toThrow("budget exhausted");
  });

  it("caps deep audits at sixteen external searches", () => {
    const cm = new CreditManager();
    cm.initAudit("deep-many-claims", "deep");
    for (let i = 0; i < 16; i++) cm.spend("deep-many-claims");
    expect(cm.snapshot("deep-many-claims").used).toBe(16);
    expect(cm.canSpend("deep-many-claims")).toBe(false);
  });
});

describe("query cache", () => {
  it("returns stored payload for same engine+query", async () => {
    const cache = new QueryCache();
    await cache.set("google", "nike recycled", { hits: [1] });
    const hit = await cache.get("google", "nike recycled");
    expect(hit).toEqual({ hits: [1] });
  });
});

describe("normalization", () => {
  it("canonicalizes tracking params", () => {
    expect(canonicalizeUrl("https://WWW.Example.com/a/?utm_source=x")).toBe("https://example.com/a");
  });
  it("normalizes queries", () => {
    expect(normalizeQuery("  Nike  Recycled!! ")).toBe("nike recycled");
  });
});
