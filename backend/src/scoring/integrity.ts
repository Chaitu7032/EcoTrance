import type { Claim, Evidence, AuditMetrics, SearchEngine, EvidenceGap } from "@ecotrace/shared";
import { isIndependent } from "../analysis/statusRules.js";

export interface IndicatorBreakdown {
  evidenceCoverage: number;
  sourceIndependence: number;
  evidenceConsistency: number;
  freshness: number;
  claimSpecificity: number;
  evidenceConflict: number;
  evidenceGap: number;
  integrity: number;
}

export function clamp01(n: number): number {
  if (Number.isNaN(n) || !Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function to100(n: number): number {
  return Math.round(clamp01(n) * 100);
}

/**
 * Authoritative scoring function for a single claim.
 * Inputs are deduplicated by cluster or canonical URL so duplicate hits do not inflate scores.
 */
export function computeIndicators(claim: Claim, evidence: Evidence[], gaps: string[] = []): IndicatorBreakdown {
  const usable = evidence.filter((e) => e.relation !== "IRRELEVANT");

  // Deduplicate evidence records by clusterId or canonical URL to prevent duplication inflation
  const distinctMap = new Map<string, Evidence>();
  for (const e of usable) {
    const key = e.clusterId || e.url;
    if (!distinctMap.has(key)) {
      distinctMap.set(key, e);
    }
  }
  const distinct = Array.from(distinctMap.values());

  const support = distinct.filter((e) => e.relation === "SUPPORTING");
  const conflict = distinct.filter((e) => e.relation === "CONTRADICTING");
  const independent = distinct.filter(isIndependent);
  const engines = new Set(distinct.map((e) => e.engine));

  // Evidence Coverage: proportion of structured evidence requirements addressed by distinct sources
  const coverage = clamp01(
    Math.min(1, distinct.length / 4) * 0.5 +
      Math.min(1, engines.size / 3) * 0.25 +
      Math.min(1, independent.length / 2) * 0.25,
  );

  // Source Independence: proportion of distinct usable sources that are genuinely independent
  const independence = distinct.length
    ? clamp01(independent.length / distinct.length)
    : 0;

  // Consistency: lack of substantive contradiction among polarized sources
  const totalPolar = support.length + conflict.length;
  const consistency =
    totalPolar === 0 ? 0.35 : clamp01(1 - conflict.length / totalPolar);

  // Evidence Freshness: average publication freshness among distinct sources
  const freshness = distinct.length
    ? distinct.reduce((s, e) => s + (e.freshnessScore ?? 0.35), 0) / distinct.length
    : 0.35;

  // Claim Specificity: density of measurable variables, metrics, baselines, and scope
  const specificity = clamp01(claim.specificityScore ?? 0);

  // Evidence Conflict: proportion of polarized distinct evidence that contradicts the claim
  const conflictScore = totalPolar > 0 ? clamp01(conflict.length / totalPolar) : 0;

  // Evidence Gap: proportion of unresolved verification needs
  // Base expectation is at least 2 distinct corroborating pillars
  const expectedPillars = Math.max(2, gaps.length);
  const gapScore = distinct.length === 0 ? 1 : clamp01(gaps.length / expectedPillars);

  // Composite Claim Integrity Indicator
  const integrity =
    0.3 * coverage +
    0.25 * independence +
    0.2 * consistency +
    0.15 * freshness +
    0.1 * specificity;

  return {
    evidenceCoverage: to100(coverage),
    sourceIndependence: to100(independence),
    evidenceConsistency: to100(consistency),
    freshness: to100(freshness),
    claimSpecificity: to100(specificity),
    evidenceConflict: to100(conflictScore),
    evidenceGap: to100(gapScore),
    integrity: to100(integrity),
  };
}

/**
 * Authoritative score aggregation across the entire audit.
 * Uses the exact arithmetic mean of claim indicators to ensure internal consistency across all views.
 */
export function aggregateMetrics(
  auditId: string,
  claims: Claim[],
  evidence: Evidence[],
  enginesUsed: SearchEngine[],
  requestsUsed: number,
  requestsCached: number,
  requestsEstimated: number,
  remainingBudget: number,
  publicAttention: number | null,
  gapCount: number,
  gapsList?: EvidenceGap[],
): AuditMetrics {
  const indicators = claims.map((c) => {
    const ev = evidence.filter((e) => e.claimId === c.id);
    const claimGaps = gapsList?.find((g) => g.claimId === c.id)?.missing ?? [];
    return computeIndicators(c, ev, claimGaps);
  });

  const avg = (sel: (i: IndicatorBreakdown) => number) =>
    indicators.length ? Math.round(indicators.reduce((s, i) => s + sel(i), 0) / indicators.length) : 0;

  const domains = new Set(evidence.filter((e) => e.relation !== "IRRELEVANT").map((e) => e.domain));

  return {
    auditId,
    claimIntegrity: avg((i) => i.integrity),
    evidenceCoverage: avg((i) => i.evidenceCoverage),
    sourceIndependence: avg((i) => i.sourceIndependence),
    evidenceConflict: avg((i) => i.evidenceConflict),
    evidenceFreshness: avg((i) => i.freshness),
    claimSpecificity: avg((i) => i.claimSpecificity),
    evidenceGap: indicators.length ? avg((i) => i.evidenceGap) : to100(clamp01(gapCount / Math.max(1, claims.length * 2))),
    publicAttention,
    evidenceCount: evidence.filter((e) => e.relation !== "IRRELEVANT").length,
    sourceCount: domains.size,
    claimCount: claims.length,
    enginesUsed,
    requestsUsed: Math.max(0, requestsUsed),
    requestsCached: Math.max(0, requestsCached),
    requestsEstimated: Math.max(0, requestsEstimated),
    remainingBudget: Math.max(0, remainingBudget),
  };
}
