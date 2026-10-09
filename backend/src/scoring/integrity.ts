import type { Claim, Evidence, AuditMetrics, SearchEngine } from "@ecotrace/shared";
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
  return Math.max(0, Math.min(1, n));
}

export function to100(n: number): number {
  return Math.round(clamp01(n) * 100);
}

export function computeIndicators(claim: Claim, evidence: Evidence[], gaps: string[]): IndicatorBreakdown {
  const usable = evidence.filter((e) => e.relation !== "IRRELEVANT");
  const support = usable.filter((e) => e.relation === "SUPPORTING");
  const conflict = usable.filter((e) => e.relation === "CONTRADICTING");
  const independent = usable.filter(isIndependent);
  const engines = new Set(usable.map((e) => e.engine));

  const coverage = clamp01(
    Math.min(1, usable.length / 6) * 0.55 +
      Math.min(1, engines.size / 4) * 0.25 +
      Math.min(1, independent.length / 3) * 0.2,
  );

  const independence = usable.length
    ? clamp01(independent.length / Math.max(1, usable.length))
    : 0;

  const totalPolar = support.length + conflict.length;
  const consistency =
    totalPolar === 0 ? 0.35 : clamp01(1 - conflict.length / totalPolar);

  const freshness = usable.length
    ? usable.reduce((s, e) => s + e.freshnessScore, 0) / usable.length
    : 0.35;

  const specificity = clamp01(claim.specificityScore);
  const conflictScore = clamp01(conflict.length / Math.max(1, support.length + conflict.length));
  const gapScore = clamp01(gaps.length / 6);

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
): AuditMetrics {
  const indicators = claims.map((c) => {
    const ev = evidence.filter((e) => e.claimId === c.id);
    return computeIndicators(c, ev, []);
  });
  const avg = (sel: (i: IndicatorBreakdown) => number) =>
    indicators.length ? Math.round(indicators.reduce((s, i) => s + sel(i), 0) / indicators.length) : 0;

  const domains = new Set(evidence.map((e) => e.domain));
  return {
    auditId,
    claimIntegrity: avg((i) => i.integrity),
    evidenceCoverage: avg((i) => i.evidenceCoverage),
    sourceIndependence: avg((i) => i.sourceIndependence),
    evidenceConflict: avg((i) => i.evidenceConflict),
    evidenceFreshness: avg((i) => i.freshness),
    claimSpecificity: avg((i) => i.claimSpecificity),
    evidenceGap: to100(clamp01(gapCount / Math.max(1, claims.length * 3))),
    publicAttention,
    evidenceCount: evidence.length,
    sourceCount: domains.size,
    claimCount: claims.length,
    enginesUsed,
    requestsUsed,
    requestsCached,
    requestsEstimated,
    remainingBudget,
  };
}
