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
import { planDiscoveryQueries, planSubclaimQueries, planTrendQueries, planAdsTransparencyQueries, planPatentsQueries, planForumsQueries, planYoutubeQueries, type PlannedQuery } from "./QueryPlanner.js";
import { LlmClient, heuristicRelation } from "../llm/LlmClient.js";
import { clusterSources } from "../analysis/clustering.js";
import { freshnessBand, freshnessScore } from "../analysis/freshness.js";
import { independenceBaseline, sourceQualityBaseline } from "../analysis/sourceType.js";
import { determineClaimStatus } from "../analysis/statusRules.js";
import { detectGaps } from "../analysis/gaps.js";
import { buildClaimEvents } from "../analysis/claimEvents.js";
import { aggregateMetrics, computeIndicators } from "../scoring/integrity.js";
import { calculateSpecificity } from "../scoring/specificity.js";
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
      status: (engine === "google_trends" || engine === "youtube") && mode === "quick" ? "skipped" : "pending",
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

    // Run all core evidence engines in parallel — they are fully independent
    const bundle = store.must(auditId);
    const runTrends = bundle.audit.mode === "deep";
    if (!runTrends) {
      this.markEngine(auditId, "google_trends", "skipped", "Skipped in quick audit");
    }

    const [web, news, scholar, shop, trendsSources] = await Promise.all([
      this.runEngine(auditId, "google", grouped.get("google") ?? []),
      this.runEngine(auditId, "google_news", grouped.get("google_news") ?? []),
      this.runEngine(auditId, "google_scholar", grouped.get("google_scholar") ?? []),
      this.runEngine(auditId, "google_shopping", grouped.get("google_shopping") ?? []),
      runTrends
        ? this.runEngine(auditId, "google_trends", planTrendQueries(bundle.company.name))
        : Promise.resolve([]),
    ]);

    // --- New SerpAPI engines ---
    const bundleForNew = store.must(auditId);
    const companyName = bundleForNew.company.name;

    // Ads Transparency: always run — critical for greenwashing detection
    await this.setStage(auditId, "scanning_ads");
    const adsSources = await this.runEngine(
      auditId,
      "google_ads_transparency",
      planAdsTransparencyQueries(companyName),
    );

    // Patents: run for deep audits or when technical claims exist
    await this.setStage(auditId, "scanning_patents");
    const technicalClaims = bundleForNew.claims.filter((c) =>
      ["MATERIALS", "ENERGY", "CARBON", "RECYCLING", "CLIMATE"].includes(c.category),
    );
    const patentSources: EvidenceSource[] = [];
    if (technicalClaims.length > 0) {
      const patentQueries = planPatentsQueries(
        companyName,
        technicalClaims.map((c) => c.text).join(" "),
      );
      const patents = await this.runEngine(auditId, "google_patents", patentQueries);
      patentSources.push(...patents);
    } else {
      this.markEngine(auditId, "google_patents", "skipped", "No technical claims to verify");
    }

    // Forums: always run — independent community signals
    await this.setStage(auditId, "scanning_community");
    const forumSources = await this.runEngine(
      auditId,
      "google_forums",
      planForumsQueries(companyName),
    );

    // YouTube: deep audits only — executive primary source statements
    let videoSources: EvidenceSource[] = [];
    if (bundleForNew.audit.mode === "deep") {
      await this.setStage(auditId, "scanning_video");
      videoSources = await this.runEngine(
        auditId,
        "youtube",
        planYoutubeQueries(companyName),
      );
    } else {
      this.markEngine(auditId, "youtube", "skipped", "Skipped in quick audit");
    }

    await this.setStage(auditId, "normalizing_evidence");
    const allSources = [...discoverySources, ...web, ...news, ...scholar, ...shop, ...trendsSources, ...adsSources, ...patentSources, ...forumSources, ...videoSources];
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
      if (last?.status === "error") failed = last.error;
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
              : plan.engine === "google_ads_transparency"
                ? searchGateway.searchAdsTransparency.bind(searchGateway)
                : plan.engine === "google_patents"
                  ? searchGateway.searchPatents.bind(searchGateway)
                  : plan.engine === "google_forums"
                    ? searchGateway.searchForums.bind(searchGateway)
                    : plan.engine === "youtube"
                      ? searchGateway.searchYoutube.bind(searchGateway)
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

    const relationInputs: Array<{ evidenceId: string; claim: string; title: string; snippet: string; sourceType: string; date: string | null }> = [];
    const evidenceMeta = new Map<string, { sub: Subclaim; claim: Claim; s: EvidenceSource; rel: number; clusterId: string | null }>();
    for (const sub of bundle.subclaims) {
      const claim = bundle.claims.find((c) => c.id === sub.claimId);
      if (!claim) continue;
      const ranked = uniqueSources
        .map((s) => ({ s, rel: relevance(claim.text + " " + sub.text, s) }))
        .filter((x) => x.rel > 0.12)
        .sort((a, b) => b.rel - a.rel)
        .slice(0, bundle.audit.mode === "quick" ? 5 : 8);

      for (const { s, rel } of ranked) {
        const cluster = clusters.get(s.id);
        const evidenceId = `E${relationInputs.length + 1}`;
        relationInputs.push({ evidenceId, claim: `${claim.text} | ${sub.text}`, title: s.title, snippet: s.snippet, sourceType: s.sourceType, date: s.publishedAt });
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
    const claims = bundle.claims.map((claim) => {
      const ev = bundle.evidence.filter((e) => e.claimId === claim.id);
      const status = determineClaimStatus(ev);
      const gap = detectGaps(claim, bundle.subclaims.filter((s) => s.claimId === claim.id), ev);
      const ind = computeIndicators(claim, ev, gap.missing);
      const bullets = [
        `${ev.filter((e) => e.relation === "SUPPORTING").length} supporting sources.`,
        `${ev.filter((e) => e.relation === "CONTRADICTING").length} contradicting sources.`,
        `${ev.filter((e) => e.sourceType !== "OFFICIAL_COMPANY").length} non-company sources.`,
        gap.missing.length ? `Gaps: ${gap.missing.slice(0, 3).join("; ")}.` : "No major structured gaps flagged.",
      ];
      return {
        ...claim,
        status,
        integrityScore: ind.integrity,
        explanation: `EcoTrace reached ${status} because ${bullets.join(" ")} This is not a finding of wrongdoing.`,
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

function formatMetricsTable(m: import("@ecotrace/shared").AuditMetrics): string {
  return [
    "| Metric | Value |",
    "|---|---|",
    `| Claim Integrity | ${m.claimIntegrity}% |`,
    `| Evidence Coverage | ${m.evidenceCoverage}% |`,
    `| Source Independence | ${m.sourceIndependence}% |`,
    `| Evidence Conflict | ${m.evidenceConflict}% |`,
    `| Evidence Freshness | ${m.evidenceFreshness}% |`,
    `| Claim Specificity | ${m.claimSpecificity}% |`,
    `| Evidence Gap | ${m.evidenceGap}% |`,
    `| Public Attention | ${m.publicAttention !== null ? m.publicAttention + "%" : "n/a"} |`,
    `| Evidence Items | ${m.evidenceCount} |`,
    `| Distinct Sources | ${m.sourceCount} |`,
    `| Claims Evaluated | ${m.claimCount} |`,
    `| Searches Used | ${m.requestsUsed} |`,
    `| Cached Hits | ${m.requestsCached} |`,
    `| Engines Used | ${m.enginesUsed.join(", ")} |`,
  ].join("\n");
}

export function renderExport(bundle: AuditBundle): string {
  const { DISCLAIMER } = awaitDummy();
  const lines = [
    `# EcoTrace Audit — ${bundle.company.name}`,
    "",
    `Date: ${bundle.audit.createdAt}`,
    `Mode: ${bundle.audit.mode}`,
    `Status: ${bundle.audit.status}`,
    bundle.audit.mockMode ? "DATA: DEMO DATA (mock mode)" : "DATA: live SerpApi retrieval",
    "",
    "## Methodology",
    "1. Claims discovered from public search",
    "2. Claims decomposed into atomic subclaims",
    "3. Queries generated for support and conflict",
    "4. Evidence retrieved via SerpApi engines",
    "5. Sources normalized and de-duplicated",
    "6. Source independence estimated via clustering",
    "7. Evidence relationships evaluated",
    "8. Claim Integrity Indicator calculated (coverage, independence, consistency, freshness, specificity)",
    "",
    "## Metrics",
    bundle.metrics ? formatMetricsTable(bundle.metrics) : "n/a",
    "",
    "## Claims",
  ];
  for (const c of bundle.claims) {
    lines.push(`### ${c.text}`, `Status: ${c.status}`, `Integrity: ${c.integrityScore ?? "n/a"}`, c.explanation ?? "", "");
    const ev = bundle.evidence.filter((e) => e.claimId === c.id);
    for (const e of ev.slice(0, 8)) {
      lines.push(`- [${e.relation}] ${e.title} (${e.sourceName}, ${e.engine}) — ${e.url}`);
    }
    const gap = bundle.gaps.find((g) => g.claimId === c.id);
    if (gap) lines.push(`Evidence gap: ${gap.requiredToSubstantiate}`);
    lines.push("");
  }
  lines.push("## Disclaimer", DISCLAIMER);
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

// Synonym map: maps term -> set of synonyms that should count as matches.
// Deterministic, no API calls. Improves claim-evidence matching significantly.
const SYNONYM_MAP: Record<string, string[]> = {
  carbon: ["co2", "ghg", "greenhouse", "emissions", "co₂"],
  emissions: ["carbon", "co2", "ghg", "greenhouse", "pollutant"],
  "net-zero": ["netzero", "carbon neutral", "carbonneutral", "zero emission", "climate neutral"],
  renewable: ["solar", "wind", "hydro", "geothermal", "clean energy", "green energy"],
  recycled: ["recycling", "recycl", "post-consumer", "postconsumer", "upcycled", "reclaimed"],
  plastic: ["packaging", "polyester", "polymer", "pet", "hdpe", "single-use"],
  packaging: ["plastic", "container", "wrapper", "box", "bottle"],
  sustainable: ["sustainability", "responsibly", "responsible", "ethical"],
  water: ["wastewater", "freshwater", "effluent", "h2o", "water use"],
  waste: ["landfill", "circular", "zero waste", "divert"],
  forest: ["deforestation", "wood", "timber", "trees", "biodiversity"],
  supply: ["supplier", "sourcing", "procurement", "tier"],
  energy: ["electricity", "power", "kwh", "mwh", "grid"],
};

function expandTerms(tokens: Set<string>): Set<string> {
  const expanded = new Set(tokens);
  for (const token of tokens) {
    const synonyms = SYNONYM_MAP[token];
    if (synonyms) {
      for (const s of synonyms) expanded.add(s);
    }
  }
  return expanded;
}

function relevance(claim: string, s: EvidenceSource): number {
  const rawA = new Set(normalizeQuery(claim).split(" ").filter((w) => w.length > 3));
  const rawB = new Set(normalizeQuery(`${s.title} ${s.snippet}`).split(" ").filter((w) => w.length > 3));
  // Expand both sets with synonyms before computing Jaccard overlap
  const a = expandTerms(rawA);
  const b = expandTerms(rawB);
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const j = inter / Math.max(1, a.size + b.size - inter);
  // Bonus for high-quality source types
  const engineBonus =
    s.engine === "google_scholar" ? 0.12 :
    s.engine === "google_patents" ? 0.08 :
    s.engine === "google_ads_transparency" ? 0.05 : 0;
  return Math.min(1, j * 3 + engineBonus);
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
    case "google_ads_transparency":
      return "Google Ads Transparency";
    case "google_patents":
      return "Google Patents";
    case "google_forums":
      return "Google Forums";
    case "youtube":
      return "YouTube";
  }
}

export { buildClaimEvents };

export function demoCompanyHint(input: string): boolean {
  return normalizeQuery(input) === normalizeQuery(DEMO_COMPANY);
}

export { extractDomain };

