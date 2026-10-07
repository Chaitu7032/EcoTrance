import type { Claim, Evidence, EvidenceGap, Subclaim } from "@ecotrace/shared";

const GAP_CHECKS: { test: (claim: Claim, evidence: Evidence[]) => boolean; missing: string }[] = [
  {
    test: (c, ev) => /reduc|cut|lower|decreas/i.test(c.text) && !ev.some((e) => /\d+\s?%/.test(e.snippet + e.title)),
    missing: "Quantified reduction percentage not found in retrieved evidence",
  },
  {
    test: (c, ev) => /reduc|baseline|compared/i.test(c.text) && !ev.some((e) => /baseline|compared with|versus|vs\./i.test(e.snippet)),
    missing: "Baseline year or comparison reference unavailable",
  },
  {
    test: (c) => /net[- ]?zero|carbon neutral|emissions/i.test(c.text),
    missing: "Independent verification of emissions accounting not located",
  },
  {
    test: (c, ev) => /recycl/i.test(c.text) && !ev.some((e) => /\d+\s?%/.test(e.snippet + e.title)),
    missing: "Disclosed recycled-content percentage unavailable or inconsistent",
  },
  {
    test: (_c, ev) => !ev.some((e) => e.sourceType === "SCIENTIFIC" || e.sourceType === "ACADEMIC"),
    missing: "Scientific literature relevant to the underlying proposition is thin or unavailable",
  },
  {
    test: (_c, ev) => !ev.some((e) => e.sourceType !== "OFFICIAL_COMPANY" && e.relation === "SUPPORTING"),
    missing: "Independent supporting evidence is limited",
  },
  {
    test: (c, ev) => /packag/i.test(c.text) && !ev.some((e) => /lca|lifecycle|life cycle/i.test(e.snippet)),
    missing: "Lifecycle assessment methodology not found",
  },
  {
    test: (c) => !c.claimDate,
    missing: "Reporting period or claim date is unclear",
  },
];

export function detectGaps(claim: Claim, subclaims: Subclaim[], evidence: Evidence[]): EvidenceGap {
  const missing: string[] = [];
  for (const check of GAP_CHECKS) {
    if (check.test(claim, evidence) && !missing.includes(check.missing)) {
      missing.push(check.missing);
    }
  }
  if (subclaims.length && evidence.length < subclaims.length) {
    missing.push("One or more atomic subclaims lack dedicated evidence");
  }
  if (!evidence.length) {
    missing.push("No usable retrieved sources mapped to this claim");
  }
  const required = missing.length
    ? `To substantiate this claim, EcoTrace would need: ${missing.join("; ")}.`
    : "Retrieved evidence covers the main testable parts of this claim, though human review is still recommended.";
  return { claimId: claim.id, missing, requiredToSubstantiate: required };
}
