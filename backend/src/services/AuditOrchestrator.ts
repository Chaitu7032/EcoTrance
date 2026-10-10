import { randomUUID } from "node:crypto";
import type {
  Audit,
  AuditEngineState,
  AuditMode,
  AuditStage,
  Claim,
  Company,
  CompanyCandidate,
  CreditSnapshot,
  Evidence,
  EvidenceGraph,
  EvidenceRelation,
  SearchEngine,
  Subclaim,
} from "@ecotrace/shared";
import { SEARCH_ENGINES } from "@ecotrace/shared";
import { store, type AuditBundle } from "../repositories/Store.js";
import { searchGateway } from "./SearchGateway.js";
import { creditManager } from "./CreditManager.js";
import { planDiscoveryQueries, planSubclaimQueries, planTrendQueries, type PlannedQuery } from "./QueryPlanner.js";
import { LlmClient, heuristicRelation } from "../llm/LlmClient.js";
import { clusterSources } from "../analysis/clustering.js";
import { freshnessBand, freshnessScore } from "../analysis/freshness.js";
import { independenceBaseline, sourceQualityBaseline } from "../analysis/sourceType.js";
import { determineClaimStatus } from "../analysis/statusRules.js";
import { detectGaps } from "../analysis/gaps.js";
import { buildClaimEvents } from "../analysis/claimEvents.js";
import { aggregateMetrics, computeIndicators } from "../scoring/integrity.js";
import { calculateSpecificity } from "../scoring/specificity.js";
import { checkEntityMatch } from "../analysis/evidenceMatcher.js";
import { logger } from "../utils/logger.js";
import { extractDomain, normalizeQuery } from "../utils/url.js";
import { env, isMockMode } from "../config/env.js";
import { DEMO_COMPANY } from "../fixtures/demo.js";
import type { EvidenceSource } from "@ecotrace/shared";

const llm = new LlmClient();

export class AuditOrchestrator {
  estimate(mode: AuditMode): CreditSnapshot {
    const tmp = `estimate-${mode}`;
    return creditManager.initAudit(tmp, mode);
  }

  async start(companyInput: string, mode: AuditMode, selectedDomain?: string): Promise<AuditBundle> {
    const company = store.createCompany({
      name: companyInput.trim(),
      officialDomain: selectedDomain ?? null,
      aliases: [companyInput.trim()],
      industry: null,
      country: null,
    });
    const now = new Date().toISOString();
    const audit: Audit = {
      id: randomUUID(),
      companyId: company.id,
      companyName: company.name,
      mode,
      status: "running",
      stage: "queued",
      mockMode: isMockMode(),
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      error: null,
      notes: [],
    };
    const engines: AuditEngineState[] = SEARCH_ENGINES.map((engine) => ({
      engine,
      status: engine === "google_trends" && mode === "quick" ? "skipped" : "pending",
      error: null,
      retryCount: 0,
      requestCount: 0,
      resultCount: 0,
    }));
    const bundle = store.createAudit({
      audit,
      company,
      claims: [],
      subclaims: [],
      evidence: [],
      engines,
      requests: [],
      metrics: null,
      gaps: [],
      events: [],
      clusters: [],
    });
    creditManager.initAudit(audit.id, mode);
    void this.run(audit.id).catch((err) => {
      logger.error({ msg: "audit_failed", auditId: audit.id, error: err instanceof Error ? err.message : "unknown" });
      store.updateAudit(audit.id, {
        audit: { status: "failed", error: err instanceof Error ? err.message : "unknown", stage: "completed" },
      });
    });
    return bundle;
  }

  private async run(auditId: string): Promise<void> {
    logger.info({ msg: "audit_started", auditId });
    llm.setAuditMode(store.must(auditId).audit.mode);
    await this.setStage(auditId, "resolving_entity");
    await this.resolveEntity(auditId);

    await this.setStage(auditId, "discovering_claims");
    const discoverySources = await this.discover(auditId);

    await this.setStage(auditId, "decomposing_claims");
    await this.extractAndDecompose(auditId, discoverySources);

    await this.setStage(auditId, "planning_queries");
    const planned = this.planEvidenceQueries(auditId);

    const grouped = groupByEngine(planned);
    await this.setStage(auditId, "searching_independent");
    const web = await this.runEngine(auditId, "google", grouped.get("google") ?? []);

    await this.setStage(auditId, "analyzing_news");
    const news = await this.runEngine(auditId, "google_news", grouped.get("google_news") ?? []);

    await this.setStage(auditId, "testing_scientific");
    const scholar = await this.runEngine(auditId, "google_scholar", grouped.get("google_scholar") ?? []);

    await this.setStage(auditId, "checking_products");
    const shop = await this.runEngine(auditId, "google_shopping", grouped.get("google_shopping") ?? []);

    let trendsSources: EvidenceSource[] = [];
    const bundle = store.must(auditId);
    if (bundle.audit.mode === "deep") {
      await this.setStage(auditId, "analyzing_trends");
      trendsSources = await this.runEngine(auditId, "google_trends", planTrendQueries(bundle.company.name));
    } else {
      this.markEngine(auditId, "google_trends", "skipped", "Skipped in quick audit");
    }

    await this.setStage(auditId, "normalizing_evidence");
    const allSources = [...discoverySources, ...web, ...news, ...scholar, ...shop, ...trendsSources];
    await this.analyzeEvidence(auditId, allSources);

    await this.setStage(auditId, "building_graph");
    await this.setStage(auditId, "calculating_integrity");
    this.finalizeScores(auditId);

    const final = store.must(auditId);
    const failed = final.engines.filter((e) => e.status === "failed");
    const status = failed.length ? "partial" : "completed";
    store.updateAudit(auditId, {
      audit: {
        status,
        stage: "completed",
        completedAt: new Date().toISOString(),
      },
    });
    logger.info({ msg: "audit_completed", auditId, status });
  }

  private async resolveEntity(auditId: string): Promise<void> {
    const bundle = store.must(auditId);
    const name = bundle.company.name;
    const res = await searchGateway.searchWeb(`${name} official website`, {
      auditId,
      purpose: "entity_resolution",
    });
    this.bumpEngine(auditId, "google", res);
    const candidates: CompanyCandidate[] = res.sources.slice(0, 6).map((s) => ({
      name,
      domain: s.domain,
      snippet: s.snippet,
      url: s.url,
      score: /official|corporate|investor/.test(`${s.title} ${s.snippet}`.toLowerCase()) ? 0.8 : 0.5,
    }));
    const best = candidates.sort((a, b) => b.score - a.score)[0];
    const domain = bundle.company.officialDomain ?? best?.domain ?? null;
    const company: Company = {
      ...bundle.company,
      officialDomain: domain,
      aliases: unique([bundle.company.name, name]),
    };
    const notes = [...bundle.audit.notes];
    if (candidates.length > 1) {
      notes.push(`Entity resolution used top domain ${domain ?? "unknown"}; other candidate domains: ${candidates
        .slice(1, 4)
        .map((c) => c.domain)
        .filter(Boolean)
        .join(", ")}`);
    }
    store.updateAudit(auditId, { company, audit: { notes } });
  }

  private async discover(auditId: string): Promise<EvidenceSource[]> {
    const bundle = store.must(auditId);
    const plans = planDiscoveryQueries(bundle.company.name, bundle.audit.mode).filter(
      (p) => p.purpose !== "entity_resolution",
    );
    const collected: EvidenceSource[] = [];
    for (const plan of plans) {
      const result = await this.execPlan(auditId, plan);
      collected.push(...result);
    }
    return dedupeSources(collected);
  }

  private async extractAndDecompose(auditId: string, sources: EvidenceSource[]): Promise<void> {
    const bundle = store.must(auditId);
    logger.info({ msg: "claim_discovery_started", auditId });
    let extracted: Array<{
      text: string;
      category: Claim["category"];
      sourceUrl?: string | null;
      sourceName?: string | null;
      claimDate?: string | null;
      specificity: number;
    }>;
    try {
      extracted = await llm.extractClaims(
        bundle.company.name,
        sources.map((s) => ({ title: s.title, snippet: s.snippet, url: s.url, sourceName: s.sourceName })),
      );
    } catch {
      extracted = [];
    }
    if (!extracted.length) {
      const { heuristicClaims } = await import("../llm/LlmClient.js");
      extracted = heuristicClaims(
        bundle.company.name,
        sources.map((s) => ({ title: s.title, snippet: s.snippet, url: s.url, sourceName: s.sourceName })),
      );
    }
    const claims: Claim[] = extracted.slice(0, bundle.audit.mode === "quick" ? 4 : 7).map((c, i) => ({
      id: randomUUID(),
      auditId,
      text: c.text,
      category: c.category,
      sourceUrl: c.sourceUrl ?? null,
      sourceName: c.sourceName ?? null,
      discoveredAt: new Date().toISOString(),
      claimDate: c.claimDate ?? null,
      specificityScore: calculateSpecificity(c.text),
      importanceScore: Math.max(0.4, 1 - i * 0.08),
      status: "PENDING",
      integrityScore: null,
      explanation: null,
    }));
    const subclaims: Subclaim[] = [];
    for (const claim of claims) {
      let parts: any[] = [];
      try {
        parts = await llm.decomposeClaim(claim.text, claim.category);
      } catch {
        const { heuristicSubclaims } = await import("../llm/LlmClient.js");
        parts = heuristicSubclaims(claim.text, claim.category);
      }
      const take = bundle.audit.mode === "quick" ? 3 : 5;
      
      const mergedParts = new Map<string, any>();
      for (const p of parts) {
        const normKey = p.text.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (mergedParts.has(normKey)) {
          const existing = mergedParts.get(normKey)!;
          if (!existing.testQuestion.includes(p.testQuestion)) {
            existing.testQuestion += `\n- ${p.testQuestion}`;
          }
        } else {
          mergedParts.set(normKey, { ...p, testQuestion: `- ${p.testQuestion}` });
        }
      }
      
      const uniqueParts = Array.from(mergedParts.values());
      
      for (const p of uniqueParts.slice(0, take)) {
        subclaims.push({
          id: randomUUID(),
          claimId: claim.id,
          text: p.text,
          testQuestion: p.testQuestion,
          category: p.category,
          status: "PENDING",
        });
      }
    }
    store.updateAudit(auditId, { claims, subclaims });
  }

  private planEvidenceQueries(auditId: string): PlannedQuery[] {
    const bundle = store.must(auditId);
    const planned: PlannedQuery[] = [];
    const seen = new Set<string>();
    const selectedClaimIds = new Set(bundle.claims
      .slice(0, bundle.audit.mode === "quick" ? 3 : bundle.claims.length)
      .map((claim) => claim.id));
    for (const sub of bundle.subclaims.filter((subclaim) => selectedClaimIds.has(subclaim.claimId))) {
      for (const q of planSubclaimQueries(bundle.company.name, sub.claimId, sub, bundle.audit.mode)) {
        const key = `${q.engine}|${normalizeQuery(q.query)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        planned.push(q);
      }
    }
    const maxSearches = bundle.audit.mode === "quick" ? env.SIMPLE_AUDIT_MAX_SEARCHES : env.DEEP_AUDIT_MAX_SEARCHES;
    const remainingSlots = Math.max(0, maxSearches - bundle.requests.length);
    const budget = creditManager.snapshot(auditId).remaining;
    planned.sort((a, b) => a.priority - b.priority);
    return planned.slice(0, Math.min(remainingSlots, budget));
  }

  private async runEngine(auditId: string, engine: SearchEngine, plans: PlannedQuery[]): Promise<EvidenceSource[]> {
    this.markEngine(auditId, engine, "running", null);
    const collected: EvidenceSource[] = [];
    let failed: string | null = null;
    if (!plans.length) {
      this.markEngine(auditId, engine, "skipped", "No queries planned");
      return [];
    }
    for (const plan of plans) {
      const currentBundle = store.must(auditId);
      const maxSearches = currentBundle.audit.mode === "quick" ? env.SIMPLE_AUDIT_MAX_SEARCHES : env.DEEP_AUDIT_MAX_SEARCHES;
      if (currentBundle.requests.length >= maxSearches || !creditManager.canSpend(auditId)) {
        store.updateAudit(auditId, {
          audit: { notes: [...store.must(auditId).audit.notes, "Search budget reached; remaining engines ran from cache only or were skipped."] },
        });
        break;
      }
      const sources = await this.execPlan(auditId, plan);
      collected.push(...sources);
      const last = store.must(auditId).requests.at(-1);
      if (last && last.status !== "success" && last.status !== "cached" && last.status !== "no_results") {
        failed = last.error || `Search query ${last.status.replace(/_/g, " ")}`;
      }
    }
    const unique = dedupeSources(collected);
    if (failed && !unique.length) {
      this.markEngine(auditId, engine, "failed", failed);
      this.addNote(
        auditId,
        engine === "google_scholar"
          ? "Scientific evidence unavailable during this audit."
          : `${engineLabel(engine)} unavailable during this audit.`,
      );
    } else {
      this.markEngine(auditId, engine, "success", failed);
      const engines = store.must(auditId).engines.map((e) =>
        e.engine === engine ? { ...e, resultCount: unique.length, requestCount: e.requestCount + plans.length } : e,
      );
      store.updateAudit(auditId, { engines });
    }
    return unique;
  }

  private async execPlan(auditId: string, plan: PlannedQuery): Promise<EvidenceSource[]> {
    const options = { auditId, purpose: plan.purpose, claimId: plan.claimId };
    logger.info({ msg: "query_generated", auditId, engine: plan.engine, query: plan.query, purpose: plan.purpose });
    const fn =
      plan.engine === "google"
        ? searchGateway.searchWeb.bind(searchGateway)
        : plan.engine === "google_news"
          ? searchGateway.searchNews.bind(searchGateway)
          : plan.engine === "google_scholar"
            ? searchGateway.searchScholar.bind(searchGateway)
            : plan.engine === "google_shopping"
              ? searchGateway.searchShopping.bind(searchGateway)
              : searchGateway.searchTrends.bind(searchGateway);
    const result = await fn(plan.query, options);
    this.bumpEngine(auditId, plan.engine, result);
    return result.sources;
  }

  private async analyzeEvidence(auditId: string, sources: EvidenceSource[]): Promise<void> {
    const bundle = store.must(auditId);
    const uniqueSources = dedupeSources(sources);
    const clusters = clusterSources(uniqueSources);
    const clusterList = [...new Map([...clusters.values()].map((c) => [c.clusterId, c])).values()];
    const evidence: Evidence[] = [];

    const relationInputs: Array<{ evidenceId: string; claim: string; title: string; snippet: string; sourceType: string; date: string | null; companyName?: string }> = [];
    const evidenceMeta = new Map<string, { sub: Subclaim; claim: Claim; s: EvidenceSource; rel: number; clusterId: string | null }>();
    for (const sub of bundle.subclaims) {
      const claim = bundle.claims.find((c) => c.id === sub.claimId);
      if (!claim) continue;
      const ranked = uniqueSources
        .map((s) => ({ s, rel: relevance(claim.text + " " + sub.text, s, bundle.company.name) }))
        .filter((x) => x.rel > 0.12)
        .sort((a, b) => b.rel - a.rel)
        .slice(0, bundle.audit.mode === "quick" ? 5 : 8);

      for (const { s, rel } of ranked) {
        const cluster = clusters.get(s.id);
        const evidenceId = `E${relationInputs.length + 1}`;
        relationInputs.push({
          evidenceId,
          claim: `${bundle.company.name}: ${claim.text} | ${sub.text}`,
          title: s.title,
          snippet: s.snippet,
          sourceType: s.sourceType,
          date: s.publishedAt,
          companyName: bundle.company.name,
        });
        evidenceMeta.set(evidenceId, { sub, claim, s, rel, clusterId: cluster?.clusterId ?? null });
      }
    }
    let classifications = new Map<string, ReturnType<typeof heuristicRelation>>();
    try { classifications = await llm.classifyRelations(relationInputs); } catch { /* deterministic fallback below */ }
    for (const input of relationInputs) {
        const { sub, claim, s, rel, clusterId } = evidenceMeta.get(input.evidenceId)!;
        const classified = classifications.get(input.evidenceId) ?? heuristicRelation(input);
        const cluster = clusters.get(s.id);
        const independence = clamp(
          independenceBaseline(s.sourceType) * (cluster?.independenceScore ?? 1) * (s.sourceType === "OFFICIAL_COMPANY" ? 0.4 : 1),
        );
        evidence.push({
          id: randomUUID(),
          subclaimId: sub.id,
          claimId: claim.id,
          title: s.title,
          url: s.url,
          domain: s.domain,
          snippet: s.snippet,
          sourceName: s.sourceName,
          publishedAt: s.publishedAt,
          retrievedAt: s.retrievedAt,
          engine: s.engine,
          sourceType: s.sourceType,
          relation: classified.relation as EvidenceRelation,
          relevanceScore: rel * sourceQualityBaseline(s.sourceType),
          independenceScore: independence,
          freshnessScore: freshnessScore(s.publishedAt),
          freshnessBand: freshnessBand(s.publishedAt),
          explanation: classified.reason,
          clusterId,
        });
      }

    const events = buildClaimEvents(bundle.claims, evidence);
    store.updateAudit(auditId, { evidence, clusters: clusterList, events });
  }

  private finalizeScores(auditId: string): void {
    const bundle = store.must(auditId);
    const rawGaps = bundle.claims.map((c) =>
      detectGaps(c, bundle.subclaims.filter((s) => s.claimId === c.id), bundle.evidence.filter((e) => e.claimId === c.id)),
    );

    const claims = bundle.claims.map((claim) => {
      const ev = bundle.evidence.filter((e) => e.claimId === claim.id);
      const status = determineClaimStatus(ev);
      const gap = rawGaps.find((g) => g.claimId === claim.id) ?? detectGaps(claim, bundle.subclaims.filter((s) => s.claimId === claim.id), ev);
      const ind = computeIndicators(claim, ev, gap.missing);

      const supportCount = ev.filter((e) => e.relation === "SUPPORTING").length;
      const conflictCount = ev.filter((e) => e.relation === "CONTRADICTING").length;
      const independentCount = ev.filter((e) => e.sourceType !== "OFFICIAL_COMPANY" && e.relation === "SUPPORTING").length;
      const officialCount = ev.filter((e) => e.sourceType === "OFFICIAL_COMPANY" && e.relation === "SUPPORTING").length;

      let rationale = "";
      if (status === "SUPPORTED") {
        rationale = `Substantiated by ${independentCount} independent source(s) and ${officialCount} corporate disclosure(s) with no contradictory findings.`;
      } else if (status === "PARTIALLY_SUPPORTED") {
        if (officialCount > 0 && independentCount === 0) {
          rationale = `Documented in official corporate disclosures (${officialCount} source(s)), but independent third-party verification was not retrieved.`;
        } else {
          rationale = `Partially substantiated with ${supportCount} supporting source(s); key verification requirements or subclaims remain unresolved.`;
        }
      } else if (status === "EVIDENCE_CONFLICT") {
        rationale = `Identified ${conflictCount} contradictory or challenging source(s) regarding asserted figures or commitments.`;
      } else {
        rationale = `Insufficient public evidence retrieved to substantiate or refute the proposition.`;
      }

      if (gap.missing.length) {
        rationale += ` Verification gaps: ${gap.missing.slice(0, 2).join("; ")}.`;
      }

      return {
        ...claim,
        status,
        integrityScore: ind.integrity,
        explanation: `${rationale} (Evidence assessment, not a finding of wrongdoing).`,
      };
    });

    const subclaims = bundle.subclaims.map((s) => ({
      ...s,
      status: determineClaimStatus(bundle.evidence.filter((e) => e.subclaimId === s.id)),
    }));

    const gaps = claims.map((c) =>
      detectGaps(c, subclaims.filter((s) => s.claimId === c.id), bundle.evidence.filter((e) => e.claimId === c.id)),
    );
    const credits = creditManager.snapshot(auditId);
    const enginesUsed = bundle.engines.filter((e) => e.status === "success").map((e) => e.engine);
    const attention = bundle.evidence.find((e) => e.engine === "google_trends");
    const metrics = aggregateMetrics(
      auditId,
      claims,
      bundle.evidence,
      enginesUsed,
      credits.used,
      credits.cached,
      credits.estimated,
      credits.remaining,
      attention ? Math.round(attention.relevanceScore * 100) : null,
      gaps.reduce((s, g) => s + g.missing.length, 0),
      gaps,
    );
    store.updateAudit(auditId, { claims, subclaims, gaps, metrics, audit: { notes: bundle.audit.notes } });
    logger.info({ msg: "score_generated", auditId, integrity: metrics.claimIntegrity });
  }

  private async setStage(auditId: string, stage: AuditStage): Promise<void> {
    store.updateAudit(auditId, { audit: { stage, status: "running" } });
  }

  private markEngine(auditId: string, engine: SearchEngine, status: AuditEngineState["status"], error: string | null) {
    const engines = store.must(auditId).engines.map((e) =>
      e.engine === engine ? { ...e, status, error, retryCount: status === "failed" ? e.retryCount + 1 : e.retryCount } : e,
    );
    store.updateAudit(auditId, { engines });
  }

  private bumpEngine(auditId: string, engine: SearchEngine, result: { sources: EvidenceSource[]; error?: string }) {
    const engines = store.must(auditId).engines.map((e) =>
      e.engine === engine
        ? {
            ...e,
            requestCount: e.requestCount + 1,
            resultCount: e.resultCount + result.sources.length,
            status: result.error && !result.sources.length ? "failed" : e.status === "pending" ? "running" : e.status,
            error: result.error ?? e.error,
          }
        : e,
    );
    store.updateAudit(auditId, { engines });
  }

  private addNote(auditId: string, note: string) {
    const b = store.must(auditId);
    if (b.audit.notes.includes(note)) return;
    store.updateAudit(auditId, { audit: { notes: [...b.audit.notes, note] } });
  }
}

export const orchestrator = new AuditOrchestrator();

export function buildGraph(bundle: AuditBundle): EvidenceGraph {
  const nodes: EvidenceGraph["nodes"] = [
    {
      id: `company:${bundle.company.id}`,
      type: "company",
      label: bundle.company.name,
      data: { domain: bundle.company.officialDomain },
    },
  ];
  const edges: EvidenceGraph["edges"] = [];
  const shownClaims = bundle.claims.slice(0, 8);
  for (const claim of shownClaims) {
    const claimNodeId = `claim:${claim.id}`;
    if (!nodes.some((n) => n.id === claimNodeId)) {
      nodes.push({
        id: claimNodeId,
        type: "claim",
        label: truncate(claim.text, 72),
        data: { status: claim.status, integrity: claim.integrityScore, category: claim.category },
      });
    }
    const claimEdgeId = `e-${bundle.company.id}-${claim.id}`;
    if (!edges.some((e) => e.id === claimEdgeId)) {
      edges.push({
        id: claimEdgeId,
        source: `company:${bundle.company.id}`,
        target: claimNodeId,
        relation: "RELATES_TO",
        label: "claim",
        data: {},
      });
    }
    const subs = bundle.subclaims.filter((s) => s.claimId === claim.id).slice(0, 4);
    for (const sub of subs) {
      const subNodeId = `sub:${sub.id}`;
      if (!nodes.some((n) => n.id === subNodeId)) {
        nodes.push({
          id: subNodeId,
          type: "subclaim",
          label: truncate(sub.text, 64),
          data: { status: sub.status, question: sub.testQuestion },
        });
      }
      const subEdgeId = `e-${claim.id}-${sub.id}`;
      if (!edges.some((e) => e.id === subEdgeId)) {
        edges.push({
          id: subEdgeId,
          source: claimNodeId,
          target: subNodeId,
          relation: "RELATES_TO",
          label: "decomposes",
          data: {},
        });
      }
      const evs = bundle.evidence.filter((e) => e.subclaimId === sub.id).slice(0, 4);
      for (const ev of evs) {
        const evId = `ev:${ev.id}`;
        if (!nodes.some((n) => n.id === evId)) {
          nodes.push({
            id: evId,
            type: "evidence",
            label: truncate(ev.title, 56),
            data: {
              relation: ev.relation,
              engine: ev.engine,
              snippet: ev.snippet,
              date: ev.publishedAt,
              explanation: ev.explanation,
            },
          });
        }
        const rel = ev.relation === "CONTRADICTING" ? "CONTRADICTS" : ev.relation === "SUPPORTING" ? "SUPPORTS" : "RELATES_TO";
        const evEdgeId = `e-${sub.id}-${ev.id}`;
        if (!edges.some((e) => e.id === evEdgeId)) {
          edges.push({
            id: evEdgeId,
            source: subNodeId,
            target: evId,
            relation: rel,
            label: ev.relation.toLowerCase(),
            data: {
              engine: ev.engine,
              snippet: ev.snippet,
              date: ev.publishedAt,
              source: ev.sourceName,
              confidence: ev.relevanceScore,
              why: ev.explanation,
            },
          });
        }
        const srcId = `src:${ev.domain}`;
        if (!nodes.some((n) => n.id === srcId)) {
          nodes.push({
            id: srcId,
            type: "source",
            label: ev.sourceName || ev.domain,
            data: { domain: ev.domain, sourceType: ev.sourceType, url: ev.url },
          });
        }
        const srcEdgeId = `e-${ev.id}-src`;
        if (!edges.some((e) => e.id === srcEdgeId)) {
          edges.push({
            id: srcEdgeId,
            source: evId,
            target: srcId,
            relation: "RELATES_TO",
            label: ev.sourceType.toLowerCase(),
            data: { url: ev.url },
          });
        }
      }
    }
  }
  return { nodes, edges };
}

export function renderExport(bundle: AuditBundle): string {
  const { DISCLAIMER } = awaitDummy();
  const metrics = bundle.metrics;
  const credits = creditManager.snapshot(bundle.audit.id);

  const lines = [
    `# EcoTrace Audit Dossier — ${bundle.company.name}`,
    "",
    `**Audit Identifier:** \`${bundle.audit.id}\``,
    `**Company:** ${bundle.company.name}${bundle.company.officialDomain ? ` (${bundle.company.officialDomain})` : ""}`,
    `**Audit Mode:** ${bundle.audit.mode.toUpperCase()}`,
    `**Audit Status:** ${bundle.audit.status.toUpperCase()}`,
    `**Investigation Concluded:** ${bundle.audit.completedAt || bundle.audit.createdAt}`,
    `**Data Surface:** ${bundle.audit.mockMode ? "DEMO FIXTURES (mock mode)" : "Live SerpApi multi-engine retrieval"}`,
    "",
    "## 1. Executive Summary & Authoritative Metrics",
    "",
    "| Metric | Score | Authoritative Definition |",
    "| :--- | :--- | :--- |",
    `| **Claim Integrity** | ${metrics ? `${metrics.claimIntegrity}%` : "N/A"} | Weighted composite assessing coverage, source independence, consistency, freshness, and claim specificity. |`,
    `| **Evidence Coverage** | ${metrics ? `${metrics.evidenceCoverage}%` : "N/A"} | Proportion of structured verification requirements addressed by distinct retrieved sources. |`,
    `| **Source Independence** | ${metrics ? `${metrics.sourceIndependence}%` : "N/A"} | Corroboration from genuinely distinct non-corporate publishers, discounting duplicated and syndicated reporting. |`,
    `| **Evidence Conflict** | ${metrics ? `${metrics.evidenceConflict}%` : "N/A"} | Proportion of polarized evidence contradicting claims. 0% means no qualifying conflict detected in retrieved evidence. |`,
    `| **Claim Specificity** | ${metrics ? `${metrics.claimSpecificity}%` : "N/A"} | Density of quantifiable metrics, baselines, target years, and defined operational boundaries. |`,
    `| **Evidence Gap** | ${metrics ? `${metrics.evidenceGap}%` : "N/A"} | Proportion of identified verification requirements unresolved by retrieved evidence. |`,
    "",
    "## 2. Search Budget & Retrieval Telemetry",
    "",
    `- **Search Credits Used:** ${credits.used}`,
    `- **Search Credits Remaining:** ${credits.remaining}`,
    `- **Estimated Search Budget:** ${credits.estimated}`,
    `- **Cached Responses (0 credits):** ${credits.cached}`,
    `- **Search Engines Engaged:** ${(metrics?.enginesUsed ?? []).join(", ") || "None"}`,
    `- **Usable Evidence Records:** ${metrics?.evidenceCount ?? bundle.evidence.length}`,
    `- **Distinct Publisher Domains:** ${metrics?.sourceCount ?? new Set(bundle.evidence.map(e => e.domain)).size}`,
    "",
    "## 3. Claim Register & Atomic Propositions",
    "",
  ];

  for (let i = 0; i < bundle.claims.length; i++) {
    const c = bundle.claims[i];
    const subs = bundle.subclaims.filter((s) => s.claimId === c.id);
    const ev = bundle.evidence.filter((e) => e.claimId === c.id);
    const gap = bundle.gaps.find((g) => g.claimId === c.id);

    lines.push(`### Claim ${i + 1}: ${c.text}`);
    lines.push(`- **Category:** ${c.category}`);
    lines.push(`- **Verdict:** ${c.status}`);
    lines.push(`- **Claim Integrity Score:** ${c.integrityScore !== null ? `${c.integrityScore}%` : "N/A"}`);
    lines.push(`- **Specificity Score:** ${Math.round(c.specificityScore * 100)}%`);
    if (c.sourceName || c.sourceUrl) {
      lines.push(`- **Provenance Source:** ${c.sourceName || c.sourceUrl} (${c.sourceUrl || "N/A"})`);
    }
    lines.push(`- **Investigative Assessment:** ${c.explanation || "N/A"}`);
    lines.push("");

    if (subs.length) {
      lines.push("#### Atomic Subclaims & Verification Criteria");
      for (const s of subs) {
        lines.push(`- **[${s.status}]** ${s.text}`);
        lines.push(`  *Verification Test:* ${s.testQuestion}`);
      }
      lines.push("");
    }

    lines.push("#### Retrieved Evidence & Corroboration Ledger");
    const supporting = ev.filter((e) => e.relation === "SUPPORTING");
    const contradicting = ev.filter((e) => e.relation === "CONTRADICTING");
    const mixedOrInsuff = ev.filter((e) => e.relation === "MIXED" || e.relation === "INSUFFICIENT");
    const excluded = ev.filter((e) => e.relation === "IRRELEVANT");

    if (ev.length === 0) {
      lines.push("_No usable public evidence records retrieved for this claim proposition._");
    } else {
      if (supporting.length) {
        lines.push("**Supporting Evidence:**");
        for (const e of supporting) {
          lines.push(`- **[SUPPORTING]** [${e.title}](${e.url})`);
          lines.push(`  *Publisher:* ${e.sourceName} (${e.domain}) | *Source Type:* ${e.sourceType} | *Engine:* ${e.engine} | *Date:* ${e.publishedAt || "Undated"}`);
          lines.push(`  *Assessment:* ${e.explanation}`);
        }
      }
      if (contradicting.length) {
        lines.push("**Contradicting / Challenging Evidence:**");
        for (const e of contradicting) {
          lines.push(`- **[CONTRADICTING]** [${e.title}](${e.url})`);
          lines.push(`  *Publisher:* ${e.sourceName} (${e.domain}) | *Source Type:* ${e.sourceType} | *Engine:* ${e.engine} | *Date:* ${e.publishedAt || "Undated"}`);
          lines.push(`  *Assessment:* ${e.explanation}`);
        }
      }
      if (mixedOrInsuff.length) {
        lines.push("**Insufficient / Contextual Material:**");
        for (const e of mixedOrInsuff) {
          lines.push(`- **[${e.relation}]** [${e.title}](${e.url})`);
          lines.push(`  *Publisher:* ${e.sourceName} (${e.domain}) | *Source Type:* ${e.sourceType} | *Assessment:* ${e.explanation}`);
        }
      }
      if (excluded.length) {
        lines.push("**Excluded Items (Irrelevant or Entity Mismatch):**");
        for (const e of excluded) {
          lines.push(`- **[EXCLUDED]** [${e.title}](${e.url}) — Reason: ${e.explanation}`);
        }
      }
    }
    lines.push("");

    if (gap && gap.missing?.length) {
      lines.push("#### Evidence Gaps & Substantiation Requirements");
      lines.push(gap.requiredToSubstantiate);
      for (const m of gap.missing) {
        lines.push(`- *Missing:* ${m}`);
      }
      lines.push("");
    }
  }

  lines.push("## 4. Methodology & Limitations");
  lines.push("EcoTrace evaluates corporate environmental statements through systematic proposition decomposition, multi-engine public retrieval, publisher independence clustering, and deterministic indicator aggregation.");
  lines.push("- **Claim Integrity** is an empirical measure of evidence quality, not an absolute probability of factual truth.");
  lines.push("- **Evidence Conflict = 0%** indicates no qualifying contradictions were detected in retrieved search samples; it is not proof that the proposition is universally true.");
  lines.push("- **Search Gaps** represent information not located within the allocated budget, not proof of wrongdoing.");
  lines.push("");
  lines.push("## 5. Disclaimer");
  lines.push(DISCLAIMER);

  return lines.join("\n");
}

function awaitDummy() {
  return { DISCLAIMER: "EcoTrace is an analytical research tool. Its results are based on publicly available information and automated evidence analysis. Results are not legal, regulatory, scientific certification, or proof of wrongdoing. Human review is recommended for consequential decisions." };
}

function groupByEngine(plans: PlannedQuery[]): Map<SearchEngine, PlannedQuery[]> {
  const m = new Map<SearchEngine, PlannedQuery[]>();
  for (const p of plans) {
    const list = m.get(p.engine) ?? [];
    list.push(p);
    m.set(p.engine, list);
  }
  return m;
}

function dedupeSources(sources: EvidenceSource[]): EvidenceSource[] {
  const seen = new Set<string>();
  const out: EvidenceSource[] = [];
  for (const s of sources) {
    if (seen.has(s.url)) continue;
    seen.add(s.url);
    out.push(s);
  }
  return out;
}

function relevance(claim: string, s: EvidenceSource, companyName?: string): number {
  if (companyName) {
    const entityCheck = checkEntityMatch(companyName, s.title, s.snippet);
    if (!entityCheck.matches) return 0;
  }
  const a = new Set(normalizeQuery(claim).split(" ").filter((w) => w.length > 3));
  const b = new Set(normalizeQuery(`${s.title} ${s.snippet}`).split(" ").filter((w) => w.length > 3));
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const j = inter / Math.max(1, a.size + b.size - inter);
  return Math.min(1, j * 3 + (s.engine === "google_scholar" ? 0.1 : 0));
}

function clamp(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function unique(arr: string[]): string[] {
  return [...new Set(arr.filter(Boolean))];
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

function engineLabel(engine: SearchEngine): string {
  switch (engine) {
    case "google":
      return "Google Search";
    case "google_news":
      return "Google News";
    case "google_scholar":
      return "Google Scholar";
    case "google_shopping":
      return "Google Shopping";
    case "google_trends":
      return "Google Trends";
  }
}

export { buildClaimEvents };

export function demoCompanyHint(input: string): boolean {
  return normalizeQuery(input) === normalizeQuery(DEMO_COMPANY);
}

export { extractDomain };

