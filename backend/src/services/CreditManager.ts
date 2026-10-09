import { env } from "../config/env.js";
import type { CreditSnapshot } from "@ecotrace/shared";

export class CreditExhaustedError extends Error {
  constructor(message = "SerpApi credit budget exhausted for this audit") {
    super(message);
    this.name = "CreditExhaustedError";
  }
}

export class CreditManager {
  private globalUsed = 0;
  private perAudit = new Map<string, { used: number; cached: number; estimated: number; max: number; mode: "quick" | "deep" }>();

  estimateForMode(mode: "quick" | "deep"): number {
    return this.maxForMode(mode);
  }

  maxForMode(mode: "quick" | "deep"): number {
    return Math.min(env.AUDIT_MAX_REQUESTS, mode === "quick" ? env.SIMPLE_AUDIT_MAX_SEARCHES : env.DEEP_AUDIT_MAX_SEARCHES);
  }

  initAudit(auditId: string, mode: "quick" | "deep"): CreditSnapshot {
    const estimated = this.estimateForMode(mode);
    this.perAudit.set(auditId, { used: 0, cached: 0, estimated, max: this.maxForMode(mode), mode });
    return this.snapshot(auditId);
  }

  snapshot(auditId: string): CreditSnapshot {
    const row = this.perAudit.get(auditId) ?? { used: 0, cached: 0, estimated: 0, max: env.AUDIT_MAX_REQUESTS, mode: "quick" as const };
    const max = row.max ?? this.maxForMode(row.mode ?? "quick");
    return {
      used: row.used,
      cached: row.cached,
      remaining: Math.max(0, max - row.used),
      estimated: row.estimated,
      globalUsed: this.globalUsed,
      globalRemaining: Math.max(0, env.GLOBAL_MAX_REQUESTS - this.globalUsed),
    };
  }

  canSpend(auditId: string, n = 1): boolean {
    const snap = this.snapshot(auditId);
    return snap.remaining >= n && snap.globalRemaining >= n;
  }

  recordCached(auditId: string): void {
    const row = this.perAudit.get(auditId);
    if (row) row.cached += 1;
    else this.perAudit.set(auditId, { used: 0, cached: 1, estimated: 0, max: env.AUDIT_MAX_REQUESTS, mode: "quick" });
  }

  spend(auditId: string, n = 1): void {
    if (!this.canSpend(auditId, n)) {
      throw new CreditExhaustedError();
    }
    const row = this.perAudit.get(auditId) ?? { used: 0, cached: 0, estimated: 0, max: env.AUDIT_MAX_REQUESTS, mode: "quick" as const };
    row.used += n;
    this.perAudit.set(auditId, row);
    this.globalUsed += n;
  }
}

export const creditManager = new CreditManager();
