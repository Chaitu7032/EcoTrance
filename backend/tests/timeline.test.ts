import { describe, expect, it } from "vitest";
import type { ClaimEvent } from "@ecotrace/shared";

describe("claim timeline ordering & isolation", () => {
  it("sorts events strictly chronologically", () => {
    const rawEvents: ClaimEvent[] = [
      { id: "e1", claimId: "c1", eventDate: "2026-01-14", text: "News report", sourceUrl: "https://a.com", note: "" },
      { id: "e2", claimId: "c2", eventDate: "2024-08-12", text: "Early policy", sourceUrl: "https://b.com", note: "" },
      { id: "e3", claimId: "c1", eventDate: "2025-03-01", text: "Report release", sourceUrl: "https://c.com", note: "" },
    ];

    const sorted = [...rawEvents].sort((a, b) => {
      if (!a.eventDate && !b.eventDate) return a.text.localeCompare(b.text);
      if (!a.eventDate) return 1;
      if (!b.eventDate) return -1;
      const cmp = a.eventDate.localeCompare(b.eventDate);
      if (cmp !== 0) return cmp;
      return a.text.localeCompare(b.text);
    });

    expect(sorted.map((e) => e.id)).toEqual(["e2", "e3", "e1"]);
  });

  it("handles unstated/null dates without crashing and places them deterministically", () => {
    const rawEvents: ClaimEvent[] = [
      { id: "e1", claimId: "c1", eventDate: null, text: "Undated claim", sourceUrl: "https://a.com", note: "" },
      { id: "e2", claimId: "c1", eventDate: "2025-05-10", text: "Dated report", sourceUrl: "https://b.com", note: "" },
      { id: "e3", claimId: "c2", eventDate: null, text: "Another undated", sourceUrl: "https://c.com", note: "" },
    ];

    const sorted = [...rawEvents].sort((a, b) => {
      if (!a.eventDate && !b.eventDate) return a.text.localeCompare(b.text);
      if (!a.eventDate) return 1;
      if (!b.eventDate) return -1;
      const cmp = a.eventDate.localeCompare(b.eventDate);
      if (cmp !== 0) return cmp;
      return a.text.localeCompare(b.text);
    });

    expect(sorted[0].id).toBe("e2");
    expect(sorted[1].eventDate).toBeNull();
    expect(sorted[2].eventDate).toBeNull();
  });

  it("maintains stable ordering for same-day events", () => {
    const sameDay: ClaimEvent[] = [
      { id: "e1", claimId: "c1", eventDate: "2025-03-01", text: "Zebra report", sourceUrl: "https://a.com", note: "" },
      { id: "e2", claimId: "c2", eventDate: "2025-03-01", text: "Alpha report", sourceUrl: "https://b.com", note: "" },
    ];

    const sorted = [...sameDay].sort((a, b) => {
      if (!a.eventDate && !b.eventDate) return a.text.localeCompare(b.text);
      if (!a.eventDate) return 1;
      if (!b.eventDate) return -1;
      const cmp = a.eventDate.localeCompare(b.eventDate);
      if (cmp !== 0) return cmp;
      return a.text.localeCompare(b.text);
    });

    expect(sorted[0].id).toBe("e2"); // Alpha comes before Zebra
    expect(sorted[1].id).toBe("e1");
  });
});
