import type { ClaimStatus, Evidence } from "@ecotrace/shared";

export function determineClaimStatus(evidence: Evidence[]): ClaimStatus {
  const usable = evidence.filter((e) => e.relation !== "IRRELEVANT");
  if (!usable.length) return "INSUFFICIENT_EVIDENCE";

  const support = usable.filter((e) => e.relation === "SUPPORTING");
  const conflict = usable.filter((e) => e.relation === "CONTRADICTING");
  const mixed = usable.filter((e) => e.relation === "MIXED");

  const independentSupport = support.filter((e) => e.independenceScore >= 0.5 && e.sourceType !== "OFFICIAL_COMPANY");
  const independentConflict = conflict.filter(
    (e) => e.independenceScore >= 0.5 && e.sourceType !== "OFFICIAL_COMPANY",
  );

  const companyOnly =
    support.length > 0 &&
    support.every((e) => e.sourceType === "OFFICIAL_COMPANY" || e.independenceScore < 0.35) &&
    independentSupport.length === 0;

  if (independentSupport.length >= 1 && independentConflict.length >= 1) {
    return "EVIDENCE_CONFLICT";
  }
  if (support.length >= 1 && conflict.length >= 1 && (independentSupport.length || independentConflict.length)) {
    return "EVIDENCE_CONFLICT";
  }
  if (independentSupport.length >= 2 && conflict.length === 0) {
    return "SUPPORTED";
  }
  if (independentSupport.length >= 1 && conflict.length === 0 && mixed.length === 0) {
    return "PARTIALLY_SUPPORTED";
  }
  if (support.length >= 1 && conflict.length === 0) {
    return companyOnly ? "PARTIALLY_SUPPORTED" : "PARTIALLY_SUPPORTED";
  }
  if (usable.length > 0 && support.length === 0 && conflict.length === 0) {
    const lowQuality = usable.every((e) => e.sourceType === "BLOG" || e.relevanceScore < 0.4);
    if (lowQuality) return "NEEDS_HUMAN_REVIEW";
    return "INSUFFICIENT_EVIDENCE";
  }
  if (mixed.length && !independentSupport.length && !independentConflict.length) {
    return "NEEDS_HUMAN_REVIEW";
  }
  if (conflict.length && !support.length) {
    return independentConflict.length ? "EVIDENCE_CONFLICT" : "NEEDS_HUMAN_REVIEW";
  }
  return "NEEDS_HUMAN_REVIEW";
}

export function isIndependent(e: Evidence): boolean {
  return e.sourceType !== "OFFICIAL_COMPANY" && e.independenceScore >= 0.5;
}
