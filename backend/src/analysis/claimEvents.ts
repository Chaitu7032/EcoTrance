import { randomUUID } from "node:crypto";
import type { Claim, ClaimEvent, Evidence } from "@ecotrace/shared";
import { canonicalizeUrl, normalizeQuery } from "../utils/url.js";

export function buildClaimEvents(claims: Claim[], evidence: Evidence[]): ClaimEvent[] {
  const events: ClaimEvent[] = [];
  const auditEvents = new Set<string>();

  for (const claim of claims) {
    const dated = evidence
      .filter((e) => e.claimId === claim.id && e.publishedAt)
      .sort((a, b) => String(a.publishedAt).localeCompare(String(b.publishedAt)));
    for (const e of dated.slice(0, 5)) {
      const titleKey = normalizeQuery(e.title).replace(/\b(?:the|a|an|to|and|of|by|for)\b/g, "").trim();
      const eventKey = `${canonicalizeUrl(e.url)}|${titleKey}|${e.publishedAt?.slice(0, 10) ?? "unknown"}`;
      if (auditEvents.has(eventKey)) continue;
      auditEvents.add(eventKey);
      events.push({
        id: randomUUID(),
        claimId: claim.id,
        eventDate: e.publishedAt,
        text: e.title,
        sourceUrl: e.url,
        note: `${e.relation} via ${e.engine}`,
      });
    }
  }

  // Sort audit-wide timeline strictly chronologically with deterministic tie-breaking
  events.sort((a, b) => {
    if (!a.eventDate && !b.eventDate) return a.text.localeCompare(b.text);
    if (!a.eventDate) return 1;
    if (!b.eventDate) return -1;
    const cmp = a.eventDate.localeCompare(b.eventDate);
    if (cmp !== 0) return cmp;
    return a.text.localeCompare(b.text);
  });

  return events;
}
