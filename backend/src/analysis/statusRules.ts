import type { ClaimStatus, Evidence } from "@ecotrace/shared";

export function determineClaimStatus(evidence: Evidence[]): ClaimStatus {
  const usable = evidence.filter((e) => e.relation !== "IRRELEVANT" && e.relation !== "INSUFFICIENT");
  if (!usable.length) return "INSUFFICIENT_EVIDENCE";

  const support = usable.filter((e) => e.relation === "SUPPORTING");
  const conflict = usable.filter((e) => e.relation === "CONTRADICTING");
  const mixed = usable.filter((e) => e.relation === "MIXED");

  const independentSupport = support.filter((e) => e.independenceScore >= 0.5 && e.sourceType !== "OFFICIAL_COMPANY");

  if (conflict.length >= 1) {
    return "EVIDENCE_CONFLICT";
  }
  
  if (mixed.length >= 1) {
    return "PARTIALLY_SUPPORTED";
  }

  if (independentSupport.length >= 1) {
    return "SUPPORTED";
  }

  if (support.length >= 1) {
    return "PARTIALLY_SUPPORTED"; // Supported only by company = partially supported
  }

  return "INSUFFICIENT_EVIDENCE";
}

export function isIndependent(e: Evidence): boolean {
  return e.sourceType !== "OFFICIAL_COMPANY" && e.independenceScore >= 0.5;
}
