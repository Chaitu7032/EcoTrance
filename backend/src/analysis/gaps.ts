import type { Claim, Evidence, EvidenceGap, Subclaim } from "@ecotrace/shared";

interface GapCheck {
  test: (claim: Claim, evidence: Evidence[]) => boolean;
  missing: string;
}

const PROPOSITION_GAP_CHECKS: GapCheck[] = [
  // 1. Comparative quantified reduction: only demand percentage if the claim asserts a comparative quantitative reduction
  {
    test: (c, ev) =>
      /\b(?:reduc|cut|lower|decreas)\b.*?\b(?:\d+%|percentage|half|halv)/i.test(c.text) &&
      !ev.some((e) => e.relation === "SUPPORTING" && /\d+\s?%/.test(e.snippet + e.title)),
    missing: "Quantified reduction percentage verification not found in retrieved public evidence",
  },
  // 2. Baseline comparison: only demand baseline when claim makes a comparative assertion (e.g. "reduced by 40% vs 2018")
  {
    test: (c, ev) =>
      (/\b(?:baseline|compared\s+with|versus|vs\.?|since\s+20\d{2})\b/i.test(c.text) ||
        /\b(?:reduc|cut)\s+[a-z0-9\s]+by\s+\d+%/i.test(c.text)) &&
      !ev.some((e) => /baseline|compared with|versus|vs\.|since\s+20\d{2}/i.test(e.snippet + e.title)),
    missing: "Baseline year or historical benchmark reference was not located in retrieved documents",
  },
  // 3. Emissions accounting verification (Scope / net-zero claims)
  {
    test: (c, ev) =>
      /\b(?:net[- ]?zero|carbon neutral|scope\s*[123]|ghg\s+accounting)\b/i.test(c.text) &&
      !ev.some((e) => e.sourceType !== "OFFICIAL_COMPANY" && e.relation === "SUPPORTING"),
    missing: "The automated search did not locate independent verification of emissions accounting (e.g. third-party audit or SBTi validation)",
  },
  // 4. Recycled content percentage: only if claim explicitly asserts recycled content/materials
  {
    test: (c, ev) =>
      /\b(?:recycled\s+(?:content|polyester|cotton|material|plastic)|recycled\s+by\s+\d+)/i.test(c.text) &&
      !ev.some((e) => /\d+\s?%/.test(e.snippet + e.title)),
    missing: "The search results did not include a specific certified recycled-content percentage",
  },
  // 5. Scientific/Academic literature: ONLY for technical lifecycle or scientific propositions
  {
    test: (c, ev) =>
      /\b(?:lca|lifecycle|life[- ]cycle|biodiversity|carbon\s+offset|microplastic|bio[- ]based)\b/i.test(c.text) &&
      !ev.some((e) => e.sourceType === "SCIENTIFIC" || e.sourceType === "ACADEMIC"),
    missing: "The automated query did not locate relevant peer-reviewed scientific or lifecycle assessment literature",
  },
  // 6. Independent supporting evidence: for factual claims supported only by company statements
  {
    test: (_c, ev) =>
      ev.length > 0 &&
      !ev.some((e) => e.sourceType !== "OFFICIAL_COMPANY" && e.relation === "SUPPORTING"),
    missing: "The search did not retrieve independent supporting evidence; proposition currently relies on company self-disclosure",
  },
  // 7. Packaging lifecycle assessment: only if claim specifies packaging sustainability
  {
    test: (c, ev) =>
      /\b(?:packag|carton|single[- ]use\s+plastic)\b/i.test(c.text) &&
      /\b(?:circular|100%|sustainable)\b/i.test(c.text) &&
      !ev.some((e) => /lca|lifecycle|life cycle|recyclab/i.test(e.snippet)),
    missing: "Lifecycle assessment or certified recycling standard methodology was not found in retrieved documents",
  },
  // 8. Unclear reporting period: only if claiming past reductions without any dates
  {
    test: (c) =>
      /\b(?:reduced|achieved|cut|lowered)\b/i.test(c.text) &&
      !/\b(?:20\d{2}|fy\s?\d{2,4})\b/i.test(c.text) &&
      !c.claimDate,
    missing: "Reporting period or performance assessment year is not specified in the claim proposition",
  },
];

export function detectGaps(claim: Claim, subclaims: Subclaim[], evidence: Evidence[]): EvidenceGap {
  const missing: string[] = [];
  const usable = evidence.filter((e) => e.relation !== "IRRELEVANT");

  for (const check of PROPOSITION_GAP_CHECKS) {
    if (check.test(claim, usable) && !missing.includes(check.missing)) {
      missing.push(check.missing);
    }
  }

  // Atomic subclaims gap check
  if (subclaims.length) {
    const unaddressedSubclaims = subclaims.filter(
      (s) => !usable.some((e) => e.subclaimId === s.id && (e.relation === "SUPPORTING" || e.relation === "MIXED")),
    );
    if (unaddressedSubclaims.length > 0 && unaddressedSubclaims.length < subclaims.length) {
      missing.push(`${unaddressedSubclaims.length} of ${subclaims.length} atomic subclaims lack dedicated corroborating evidence`);
    } else if (unaddressedSubclaims.length === subclaims.length && usable.length > 0) {
      missing.push("Retrieved evidence does not address the individual atomic verification requirements");
    }
  }

  if (!usable.length) {
    missing.push("No usable retrieved sources mapped to this claim in public search");
  }

  const required = missing.length
    ? `To substantiate this claim, EcoTrace would require: ${missing.join("; ")}.`
    : "Retrieved evidence covers the primary testable propositions of this claim, though human review is recommended.";

  return { claimId: claim.id, missing, requiredToSubstantiate: required };
}
