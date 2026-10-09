import { describe, expect, it } from "vitest";
import { formatPct, formatDate } from "../lib/labels";

describe("frontend formatters", () => {
  it("formats 0..1 floating point specificity scores accurately", () => {
    expect(formatPct(0.233)).toBe("23%");
    expect(formatPct(0.25)).toBe("25%");
    expect(formatPct(0.383)).toBe("38%");
    expect(formatPct(0.05)).toBe("5%");
    expect(formatPct(1.0)).toBe("100%");
  });

  it("formats 0..100 integers accurately without double-scaling", () => {
    expect(formatPct(70)).toBe("70%");
    expect(formatPct(86)).toBe("86%");
    expect(formatPct(0)).toBe("0%");
  });

  it("handles null and undefined gracefully", () => {
    expect(formatPct(null)).toBe("—");
    expect(formatPct(undefined)).toBe("—");
  });

  it("formats valid dates and handles unstated dates safely", () => {
    expect(formatDate("2026-01-14T00:00:00.000Z")).toContain("2026");
    expect(formatDate(null)).toBe("Date unstated");
    expect(formatDate(undefined)).toBe("Date unstated");
    expect(formatDate("unknown")).toBe("Date unstated");
  });
});
