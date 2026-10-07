import { randomUUID } from "node:crypto";
import type {
  Audit,
  AuditEngineState,
  AuditMetrics,
  Claim,
  ClaimEvent,
  Company,
  Evidence,
  EvidenceGap,
  SearchRequestRecord,
  SourceCluster,
  Subclaim,
} from "@ecotrace/shared";
import { withDb } from "../db/pool.js";
import { logger } from "../utils/logger.js";

export interface AuditBundle {
  audit: Audit;
  company: Company;
  claims: Claim[];
  subclaims: Subclaim[];
  evidence: Evidence[];
  engines: AuditEngineState[];
  requests: SearchRequestRecord[];
  metrics: AuditMetrics | null;
  gaps: EvidenceGap[];
  events: ClaimEvent[];
  clusters: SourceCluster[];
}

export class Store {
  private companies = new Map<string, Company>();
  private bundles = new Map<string, AuditBundle>();

  getAudit(id: string): AuditBundle | undefined {
    return this.bundles.get(id);
  }

  listAudits(): Audit[] {
    return [...this.bundles.values()].map((b) => b.audit);
  }

  createCompany(input: Omit<Company, "id"> & { id?: string }): Company {
    const company: Company = { ...input, id: input.id ?? randomUUID() };
    this.companies.set(company.id, company);
    void persistCompany(company);
    return company;
  }

  createAudit(bundle: AuditBundle): AuditBundle {
    this.bundles.set(bundle.audit.id, bundle);
    void persistAudit(bundle);
    return bundle;
  }

  updateAudit(id: string, patch: Partial<AuditBundle> & { audit?: Partial<Audit> }): AuditBundle {
    const current = this.must(id);
    const next: AuditBundle = {
      ...current,
      ...patch,
      audit: { ...current.audit, ...(patch.audit ?? {}), updatedAt: new Date().toISOString() },
      claims: patch.claims ?? current.claims,
      subclaims: patch.subclaims ?? current.subclaims,
      evidence: patch.evidence ?? current.evidence,
      engines: patch.engines ?? current.engines,
      requests: patch.requests ?? current.requests,
      metrics: patch.metrics === undefined ? current.metrics : patch.metrics,
      gaps: patch.gaps ?? current.gaps,
      events: patch.events ?? current.events,
      clusters: patch.clusters ?? current.clusters,
    };
    this.bundles.set(id, next);
    void persistAudit(next);
    return next;
  }

  appendRequest(auditId: string, rec: SearchRequestRecord): void {
    const current = this.must(auditId);
    current.requests = [...current.requests, rec];
    this.bundles.set(auditId, current);
    void persistRequest(rec);
  }

  must(id: string): AuditBundle {
    const b = this.bundles.get(id);
    if (!b) throw new Error("Audit not found");
    return b;
  }
}

export const store = new Store();

async function persistCompany(company: Company): Promise<void> {
  await withDb(async (pool) => {
    await pool.query(
      `INSERT INTO companies (id, name, official_domain, aliases, industry, country)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, official_domain = EXCLUDED.official_domain`,
      [
        company.id,
        company.name,
        company.officialDomain,
        JSON.stringify(company.aliases),
        company.industry,
        company.country,
      ],
    );
  });
}

async function persistRequest(rec: SearchRequestRecord): Promise<void> {
  await withDb(async (pool) => {
    await pool.query(
      `INSERT INTO search_requests
        (id, audit_id, engine, query, requested_at, status, response_hash, result_count, credits_used, cached, error, latency_ms, claim_id, purpose)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (id) DO NOTHING`,
      [
        rec.id,
        rec.auditId,
        rec.engine,
        rec.query,
        rec.requestedAt,
        rec.status,
        rec.responseHash,
        rec.resultCount,
        rec.creditsUsed,
        rec.cached,
        rec.error,
        rec.latencyMs,
        rec.claimId,
        rec.purpose,
      ],
    );
  });
}

async function persistAudit(bundle: AuditBundle): Promise<void> {
  await withDb(async (pool) => {
    const a = bundle.audit;
    await persistCompany(bundle.company);
    await pool.query(
      `INSERT INTO audits (id, company_id, company_name, mode, status, stage, mock_mode, error, notes, created_at, updated_at, completed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12)
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status, stage = EXCLUDED.stage, error = EXCLUDED.error,
         notes = EXCLUDED.notes, updated_at = EXCLUDED.updated_at, completed_at = EXCLUDED.completed_at`,
      [
        a.id,
        a.companyId,
        a.companyName,
        a.mode,
        a.status,
        a.stage,
        a.mockMode,
        a.error,
        JSON.stringify(a.notes),
        a.createdAt,
        a.updatedAt,
        a.completedAt,
      ],
    );
    for (const e of bundle.engines) {
      await pool.query(
        `INSERT INTO audit_engine_state (audit_id, engine, status, error, retry_count, request_count, result_count)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (audit_id, engine) DO UPDATE SET status = EXCLUDED.status, error = EXCLUDED.error,
           retry_count = EXCLUDED.retry_count, request_count = EXCLUDED.request_count, result_count = EXCLUDED.result_count`,
        [a.id, e.engine, e.status, e.error, e.retryCount, e.requestCount, e.resultCount],
      );
    }
    for (const c of bundle.claims) {
      await pool.query(
        `INSERT INTO claims (id, audit_id, text, category, source_url, source_name, discovered_at, claim_date, specificity_score, importance_score, status, integrity_score, explanation)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, integrity_score = EXCLUDED.integrity_score, explanation = EXCLUDED.explanation`,
        [
          c.id,
          c.auditId,
          c.text,
          c.category,
          c.sourceUrl,
          c.sourceName,
          c.discoveredAt,
          c.claimDate,
          c.specificityScore,
          c.importanceScore,
          c.status,
          c.integrityScore,
          c.explanation,
        ],
      );
    }
    for (const s of bundle.subclaims) {
      await pool.query(
        `INSERT INTO subclaims (id, claim_id, text, test_question, category, status)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status`,
        [s.id, s.claimId, s.text, s.testQuestion, s.category, s.status],
      );
    }
    for (const ev of bundle.evidence) {
      await pool.query(
        `INSERT INTO evidence (id, subclaim_id, claim_id, title, url, domain, snippet, source_name, published_at, retrieved_at, engine, source_type, relation, relevance_score, independence_score, freshness_score, freshness_band, explanation, cluster_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         ON CONFLICT (id) DO UPDATE SET relation = EXCLUDED.relation, explanation = EXCLUDED.explanation`,
        [
          ev.id,
          ev.subclaimId,
          ev.claimId,
          ev.title,
          ev.url,
          ev.domain,
          ev.snippet,
          ev.sourceName,
          ev.publishedAt,
          ev.retrievedAt,
          ev.engine,
          ev.sourceType,
          ev.relation,
          ev.relevanceScore,
          ev.independenceScore,
          ev.freshnessScore,
          ev.freshnessBand,
          ev.explanation,
          ev.clusterId,
        ],
      );
    }
    if (bundle.metrics) {
      await pool.query(
        `INSERT INTO audit_metrics (audit_id, payload) VALUES ($1,$2::jsonb)
         ON CONFLICT (audit_id) DO UPDATE SET payload = EXCLUDED.payload`,
        [a.id, JSON.stringify(bundle.metrics)],
      );
    }
  }).catch((err) => {
    logger.warn({ msg: "persist_audit_skipped", error: err instanceof Error ? err.message : "unknown" });
  });
}
