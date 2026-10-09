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
import { buildClaimEvents } from "../analysis/claimEvents.js";

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

const persistQueues = new Map<string, Promise<void>>();

function queuePersist(id: string, fn: () => Promise<void>): void {
  const prev = persistQueues.get(id) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  persistQueues.set(id, next);
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
    queuePersist(bundle.audit.id, () => persistAudit(bundle));
    return bundle;
  }

  updateAudit(id: string, patch: Omit<Partial<AuditBundle>, "audit"> & { audit?: Partial<Audit> }): AuditBundle {
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
    queuePersist(id, () => persistAudit(next));
    return next;
  }

  appendRequest(auditId: string, rec: SearchRequestRecord): void {
    const current = this.must(auditId);
    current.requests = [...current.requests, rec];
    this.bundles.set(auditId, current);
    queuePersist(auditId, () => persistRequest(rec));
  }

  must(id: string): AuditBundle {
    const b = this.bundles.get(id);
    if (!b) throw new Error("Audit not found");
    return b;
  }

  async loadAllFromDb(): Promise<void> {
    await withDb(async (pool) => {
      const compRes = await pool.query("SELECT * FROM companies");
      for (const row of compRes.rows) {
        this.companies.set(row.id, {
          id: row.id,
          name: row.name,
          officialDomain: row.official_domain,
          aliases: Array.isArray(row.aliases) ? row.aliases : JSON.parse(row.aliases || "[]"),
          industry: row.industry,
          country: row.country,
        });
      }

      const auditRes = await pool.query("SELECT * FROM audits ORDER BY created_at ASC");
      for (const row of auditRes.rows) {
        const company = this.companies.get(row.company_id) ?? {
          id: row.company_id,
          name: row.company_name,
          officialDomain: null,
          aliases: [row.company_name],
          industry: null,
          country: null,
        };

        const auditId = row.id;
        const [claimRows, subclaimRows, evidenceRows, engineRows, requestRows, metricRows, eventRows] = await Promise.all([
          pool.query("SELECT * FROM claims WHERE audit_id = $1 ORDER BY discovered_at ASC", [auditId]),
          pool.query("SELECT * FROM subclaims WHERE claim_id IN (SELECT id FROM claims WHERE audit_id = $1)", [auditId]),
          pool.query("SELECT * FROM evidence WHERE claim_id IN (SELECT id FROM claims WHERE audit_id = $1)", [auditId]),
          pool.query("SELECT * FROM audit_engine_state WHERE audit_id = $1", [auditId]),
          pool.query("SELECT * FROM search_requests WHERE audit_id = $1 ORDER BY requested_at ASC", [auditId]),
          pool.query("SELECT * FROM audit_metrics WHERE audit_id = $1", [auditId]),
          pool.query("SELECT * FROM claim_events WHERE claim_id IN (SELECT id FROM claims WHERE audit_id = $1)", [auditId]),
        ]);

        const claims: Claim[] = claimRows.rows.map((c) => ({
          id: c.id,
          auditId: c.audit_id,
          text: c.text,
          category: c.category,
          sourceUrl: c.source_url,
          sourceName: c.source_name,
          discoveredAt: c.discovered_at?.toISOString?.() ?? String(c.discovered_at),
          claimDate: c.claim_date ? (c.claim_date.toISOString?.() ?? String(c.claim_date)) : null,
          specificityScore: Number(c.specificity_score),
          importanceScore: Number(c.importance_score),
          status: c.status,
          integrityScore: c.integrity_score !== null ? Number(c.integrity_score) : null,
          explanation: c.explanation,
        }));

        const subclaims: Subclaim[] = subclaimRows.rows.map((s) => ({
          id: s.id,
          claimId: s.claim_id,
          text: s.text,
          testQuestion: s.test_question,
          category: s.category,
          status: s.status,
        }));

        const evidence: Evidence[] = evidenceRows.rows.map((e) => ({
          id: e.id,
          subclaimId: e.subclaim_id,
          claimId: e.claim_id,
          title: e.title,
          url: e.url,
          domain: e.domain,
          snippet: e.snippet ?? "",
          sourceName: e.source_name ?? "",
          publishedAt: e.published_at ? (e.published_at.toISOString?.() ?? String(e.published_at)) : null,
          retrievedAt: e.retrieved_at?.toISOString?.() ?? String(e.retrieved_at),
          engine: e.engine,
          sourceType: e.source_type,
          relation: e.relation,
          relevanceScore: Number(e.relevance_score),
          independenceScore: Number(e.independence_score),
          freshnessScore: Number(e.freshness_score),
          freshnessBand: e.freshness_band,
          explanation: e.explanation ?? "",
          clusterId: e.cluster_id,
        }));

        const engines: AuditEngineState[] = engineRows.rows.map((en) => ({
          engine: en.engine,
          status: en.status,
          error: en.error,
          retryCount: en.retry_count,
          requestCount: en.request_count,
          resultCount: en.result_count,
        }));

        const requests: SearchRequestRecord[] = requestRows.rows.map((r) => ({
          id: r.id,
          auditId: r.audit_id,
          engine: r.engine,
          query: r.query,
          requestedAt: r.requested_at?.toISOString?.() ?? String(r.requested_at),
          status: r.status,
          responseHash: r.response_hash,
          resultCount: r.result_count,
          creditsUsed: r.credits_used,
          cached: r.cached,
          error: r.error,
          latencyMs: r.latency_ms ?? 0,
          claimId: r.claim_id,
          purpose: r.purpose ?? "search",
        }));

        const metrics: AuditMetrics | null = metricRows.rows[0]?.payload ?? null;

        let events: ClaimEvent[] = eventRows.rows.map((ev) => ({
          id: ev.id,
          claimId: ev.claim_id,
          eventDate: ev.event_date ? (ev.event_date.toISOString?.() ?? String(ev.event_date)) : null,
          text: ev.text,
          sourceUrl: ev.source_url,
          note: ev.note ?? "",
        }));

        if (events.length === 0 && evidence.length > 0) {
          events = buildClaimEvents(claims, evidence);
        }

        // If the audit had metrics or completed queries, ensure its displayed status is completed or partial
        let status = row.status;
        let stage = row.stage;
        if (metrics && (status === "running" || stage === "calculating_integrity")) {
          const hasFailedEngine = engines.some((e) => e.status === "failed");
          status = hasFailedEngine ? "partial" : "completed";
          stage = "completed";
        }

        const audit: Audit = {
          id: row.id,
          companyId: row.company_id,
          companyName: row.company_name,
          mode: row.mode,
          status,
          stage,
          mockMode: Boolean(row.mock_mode),
          createdAt: row.created_at?.toISOString?.() ?? String(row.created_at),
          updatedAt: row.updated_at?.toISOString?.() ?? String(row.updated_at),
          completedAt: row.completed_at ? (row.completed_at.toISOString?.() ?? String(row.completed_at)) : (status === "completed" ? row.updated_at : null),
          error: row.error,
          notes: Array.isArray(row.notes) ? row.notes : JSON.parse(row.notes || "[]"),
        };

        this.bundles.set(auditId, {
          audit,
          company,
          claims,
          subclaims,
          evidence,
          engines,
          requests,
          metrics,
          gaps: [],
          events,
          clusters: [],
        });
      }
      logger.info({ msg: "loaded_audits_from_database", count: this.bundles.size });
    });
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
    for (const event of bundle.events) {
      await pool.query(
        `INSERT INTO claim_events (id, claim_id, event_date, text, source_url, note)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (id) DO UPDATE SET event_date = EXCLUDED.event_date, text = EXCLUDED.text, note = EXCLUDED.note`,
        [event.id, event.claimId, event.eventDate, event.text, event.sourceUrl, event.note],
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
