import type { Request, Response } from "express";
import dns from "node:dns/promises";
import https from "node:https";
import { z } from "zod";
import { orchestrator, buildGraph, renderExport } from "../services/AuditOrchestrator.js";
import { store } from "../repositories/Store.js";
import { creditManager } from "../services/CreditManager.js";
import { databaseUrl, isMockMode } from "../config/env.js";
import { serpApiConfig } from "../config/serpapi.js";
import { SerpApiClient, SerpApiError } from "../serpapi/SerpApiClient.js";
import { DISCLAIMER } from "@ecotrace/shared";

export const createAuditSchema = z.object({
  company: z.string().trim().min(2).max(120),
  mode: z.enum(["quick", "deep"]),
  selectedDomain: z.string().trim().max(180).optional(),
});

export function health(_req: Request, res: Response): void {
  res.json({
    ok: true,
    service: "ecotrace",
    mockMode: isMockMode(),
    serpapiConfigured: Boolean(serpApiConfig.apiKey && serpApiConfig.baseUrl) || isMockMode(),
    serpapiBaseUrlSet: Boolean(serpApiConfig.baseUrl),
    database: Boolean(databaseUrl()),
  });
}

export async function healthSerpApi(_req: Request, res: Response): Promise<void> {
  if (isMockMode()) {
    res.json({ ok: false, provider: "serpapi", errorType: "CONFIG", message: "SERPAPI_MOCK_MODE is enabled", statusCode: null });
    return;
  }
  if (!serpApiConfig.apiKey || !serpApiConfig.baseUrl) {
    res.status(503).json({ ok: false, provider: "serpapi", errorType: "CONFIG", message: "SerpApi key or base URL is missing", statusCode: null });
    return;
  }
  const started = Date.now();
  const dnsResult: { resolved: boolean; ipv4: boolean; ipv6: boolean; error?: string } = { resolved: false, ipv4: false, ipv6: false };
  try {
    const addresses = await dns.lookup("serpapi.com", { all: true });
    dnsResult.resolved = addresses.length > 0;
    dnsResult.ipv4 = addresses.some((address) => address.family === 4);
    dnsResult.ipv6 = addresses.some((address) => address.family === 6);
  } catch (error) {
    dnsResult.error = error instanceof Error ? error.message : "DNS lookup failed";
  }
  const proxy = ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "all_proxy", "no_proxy"]
    .filter((name) => Boolean(process.env[name]));
  try {
    const result = await new SerpApiClient().search({ engine: "google", q: "test" });
    res.json({ ok: true, provider: "serpapi", runtime: "node", engine: "google", resultCount: result.resultCount, latencyMs: Date.now() - started, dns: dnsResult, proxyDetected: proxy.length > 0 });
  } catch (error) {
    const err = error instanceof SerpApiError ? error : null;
    const nodeError = error as NodeJS.ErrnoException;
    const cause = nodeError.cause as NodeJS.ErrnoException | undefined;
    const errorType = err?.code === "invalid_key" ? "AUTH" : err?.code === "timeout" || err?.code === "network" ? "NETWORK" : err?.status ? "HTTP" : "UNKNOWN";
    res.status(err?.status && err.status >= 400 ? err.status : 502).json({ ok: false, provider: "serpapi", runtime: "node", dns: dnsResult, proxyDetected: proxy.length > 0, http: { reachable: false }, error: { type: errorType, code: cause?.code ?? nodeError.code ?? err?.code ?? null, message: cause?.message ?? err?.message ?? "SerpApi request failed" }, statusCode: err?.status ?? null });
  }
}

export function estimate(req: Request, res: Response): void {
  const mode = z.enum(["quick", "deep"]).parse(req.query.mode ?? "deep");
  const engines =
    mode === "quick"
      ? ["google", "google_news", "google_scholar", "google_shopping"]
      : ["google", "google_news", "google_scholar", "google_shopping", "google_trends"];
  res.json({
    mode,
    engines,
    estimate: orchestrator.estimate(mode),
    note: "Cached queries do not consume SerpApi credits.",
  });
}

export async function createAudit(req: Request, res: Response): Promise<void> {
  const body = createAuditSchema.parse(req.body);
  if (!isMockMode() && (!serpApiConfig.apiKey || !serpApiConfig.baseUrl)) {
    res.status(503).json({
      error: "SerpApi is not configured. Set SERPAPI_KEY and SERPAPI_BASE_URL, or enable SERPAPI_MOCK_MODE for local fixtures.",
    });
    return;
  }
  const bundle = await orchestrator.start(body.company, body.mode, body.selectedDomain);
  res.status(201).json({
    audit: bundle.audit,
    estimate: creditManager.snapshot(bundle.audit.id),
  });
}

export function getAudit(req: Request, res: Response): void {
  const bundle = store.getAudit(req.params.id);
  if (!bundle) {
    res.status(404).json({ error: "Audit not found" });
    return;
  }
  res.json({
    audit: bundle.audit,
    metrics: bundle.metrics,
    claims: bundle.claims,
    engines: bundle.engines,
    credits: creditManager.snapshot(bundle.audit.id),
    gaps: bundle.gaps,
    company: bundle.company,
    disclaimer: DISCLAIMER,
  });
}

export function getStatus(req: Request, res: Response): void {
  const bundle = store.getAudit(req.params.id);
  if (!bundle) {
    res.status(404).json({ error: "Audit not found" });
    return;
  }
  res.json({
    audit: bundle.audit,
    stage: bundle.audit.stage,
    engines: bundle.engines,
    credits: creditManager.snapshot(bundle.audit.id),
    notes: bundle.audit.notes,
  });
}

export function getClaims(req: Request, res: Response): void {
  const bundle = store.getAudit(req.params.id);
  if (!bundle) {
    res.status(404).json({ error: "Audit not found" });
    return;
  }
  const status = req.query.status ? String(req.query.status) : null;
  const claims = status ? bundle.claims.filter((c) => c.status === status) : bundle.claims;
  res.json({ claims });
}

export function getEvidence(req: Request, res: Response): void {
  const bundle = store.getAudit(req.params.id);
  if (!bundle) {
    res.status(404).json({ error: "Audit not found" });
    return;
  }
  res.json({ evidence: bundle.evidence });
}

export function getGraph(req: Request, res: Response): void {
  const bundle = store.getAudit(req.params.id);
  if (!bundle) {
    res.status(404).json({ error: "Audit not found" });
    return;
  }
  res.json(buildGraph(bundle));
}

export function getTimeline(req: Request, res: Response): void {
  const bundle = store.getAudit(req.params.id);
  if (!bundle) {
    res.status(404).json({ error: "Audit not found" });
    return;
  }
  res.json({ events: bundle.events });
}

export function getSearchTrace(req: Request, res: Response): void {
  const bundle = store.getAudit(req.params.id);
  if (!bundle) {
    res.status(404).json({ error: "Audit not found" });
    return;
  }
  res.json({ requests: bundle.requests });
}

export function getMetrics(req: Request, res: Response): void {
  const bundle = store.getAudit(req.params.id);
  if (!bundle) {
    res.status(404).json({ error: "Audit not found" });
    return;
  }
  res.json({ metrics: bundle.metrics, engines: bundle.engines, credits: creditManager.snapshot(bundle.audit.id) });
}

export function getClaim(req: Request, res: Response): void {
  for (const bundle of store.listAudits().map((a) => store.getAudit(a.id)!)) {
    const claim = bundle.claims.find((c) => c.id === req.params.id);
    if (!claim) continue;
    res.json({
      claim,
      subclaims: bundle.subclaims.filter((s) => s.claimId === claim.id),
      evidence: bundle.evidence.filter((e) => e.claimId === claim.id),
      gap: bundle.gaps.find((g) => g.claimId === claim.id) ?? null,
      events: bundle.events.filter((e) => e.claimId === claim.id),
    });
    return;
  }
  res.status(404).json({ error: "Claim not found" });
}

export function getClaimEvidence(req: Request, res: Response): void {
  for (const a of store.listAudits()) {
    const bundle = store.getAudit(a.id)!;
    const claim = bundle.claims.find((c) => c.id === req.params.id);
    if (!claim) continue;
    res.json({ evidence: bundle.evidence.filter((e) => e.claimId === claim.id) });
    return;
  }
  res.status(404).json({ error: "Claim not found" });
}

export async function reanalyzeClaim(req: Request, res: Response): Promise<void> {
  getClaim(req, res);
}

export function exportAudit(req: Request, res: Response): void {
  const bundle = store.getAudit(req.params.id);
  if (!bundle) {
    res.status(404).json({ error: "Audit not found" });
    return;
  }
  const markdown = renderExport(bundle);
  res.json({
    markdown,
    filename: `ecotrace-${bundle.company.name.replace(/\s+/g, "-").toLowerCase()}-${bundle.audit.id.slice(0, 8)}.md`,
  });
}
