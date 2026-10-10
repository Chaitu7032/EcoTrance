import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Download,
  ExternalLink,
  Info,
  Network,
  RefreshCw,
  Search,
  Calendar,
} from "lucide-react";
import { api } from "../api";
import { Shell } from "../components/Shell";
import { StatusBadge } from "../components/StatusBadge";
import type { ClaimStatus } from "@ecotrace/shared";
import { EvidenceGraphView } from "../components/EvidenceGraphView";
import { formatDate, formatPct, STATUS_LABELS } from "../lib/labels";

const STAGES = [
  "resolving_entity",
  "discovering_claims",
  "decomposing_claims",
  "planning_queries",
  "searching_independent",
  "analyzing_news",
  "testing_scientific",
  "checking_products",
  "analyzing_trends",
  "normalizing_evidence",
  "building_graph",
  "calculating_integrity",
  "completed",
];

export function AuditPage() {
  const { id = "" } = useParams();
  const [filter, setFilter] = useState<ClaimStatus | "ALL">("ALL");

  const detail = useQuery({
    queryKey: ["audit", id],
    queryFn: () => api.getAudit(id),
    enabled: Boolean(id),
    refetchInterval: (q) =>
      q.state.data?.audit.status === "running" || q.state.data?.audit.status === "queued"
        ? 1500
        : false,
  });

  const status = useQuery({
    queryKey: ["audit-status", id],
    queryFn: () => api.getStatus(id),
    enabled: Boolean(id),
    refetchInterval:
      detail.data?.audit.status === "completed" || detail.data?.audit.status === "failed"
        ? false
        : 1500,
  });

  const graph = useQuery({
    queryKey: ["graph", id],
    queryFn: () => api.getGraph(id),
    enabled: Boolean(id) && detail.data?.audit.status !== "running",
  });

  const timeline = useQuery({
    queryKey: ["timeline", id],
    queryFn: () => api.getTimeline(id),
    enabled: Boolean(id) && detail.data?.audit.status !== "running",
  });

  const trace = useQuery({
    queryKey: ["trace", id],
    queryFn: () => api.getTrace(id),
    enabled: Boolean(id) && detail.data?.audit.status !== "running",
  });

  const claims = useMemo(
    () =>
      (detail.data?.claims ?? []).filter((c) => filter === "ALL" || c.status === filter),
    [detail.data, filter],
  );

  if (detail.isLoading || !detail.data) {
    return (
      <Shell>
        <div className="py-24 text-center">
          <p className="font-mono text-xs uppercase tracking-widest text-[#34d399]">
            INITIALIZING WORKBENCH
          </p>
          <p className="mt-2 text-sm text-[#8e99a2]">Loading investigation records…</p>
        </div>
      </Shell>
    );
  }

  const { audit, metrics, credits } = detail.data;
  const current = status.data?.stage ?? audit.stage;
  const progress =
    current === "completed"
      ? 100
      : Math.max(5, Math.round(((STAGES.indexOf(current) + 1) / STAGES.length) * 100));

  async function download() {
    const file = await api.exportAudit(id);
    const blob = new Blob([file.markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  const isRunning = audit.status === "running" || audit.status === "queued";

  return (
    <Shell mockMode={audit.mockMode}>
      <div className="space-y-6">
        {/* Editorial Audit Header */}
        <header className="border-b border-[#22303a] pb-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-widest text-[#34d399]">
                  INVESTIGATION / {audit.mode.toUpperCase()} MODE
                </span>
                <span className="text-[#8e99a2]">·</span>
                <span className="text-xs text-[#8e99a2]">ID: {audit.id.slice(0, 8)}</span>
              </div>
              <h1 className="mt-2 font-serif text-3xl font-medium tracking-tight text-[#f4f1ea] sm:text-4xl">
                {audit.companyName}
              </h1>
              <p className="mt-1.5 text-xs text-[#8e99a2]">
                {isRunning ? "Audit in progress" : "Evidence review complete"} ·{" "}
                Created {new Date(audit.createdAt).toLocaleString()}
                {audit.completedAt ? ` · Concluded ${new Date(audit.completedAt).toLocaleString()}` : ""}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                className="flex items-center gap-1.5 rounded border border-[#22303a] bg-[#121a20] px-3 py-1.5 text-xs font-medium text-[#f4f1ea] hover:border-[#384d5c] transition-colors focus-ring"
                onClick={() => void detail.refetch()}
              >
                <RefreshCw size={13} />
                Refresh
              </button>
              <button
                type="button"
                className="flex items-center gap-1.5 rounded border border-[#2d5a43] bg-[#14231b] px-3.5 py-1.5 text-xs font-medium text-emerald-300 hover:bg-[#1a3025] transition-colors focus-ring"
                onClick={() => void download()}
              >
                <Download size={13} />
                Export Dossier
              </button>
            </div>
          </div>
        </header>

        {/* Live Progress Stage Indicator */}
        {isRunning ? (
          <section className="rounded border border-[#22303a] bg-[#121a20] p-4 text-xs">
            <div className="flex justify-between font-mono text-[11px] text-[#8e99a2]">
              <span className="tracking-wider text-[#34d399] uppercase">
                CURRENT STAGE: {current.replace(/_/g, " ")}
              </span>
              <span>{progress}%</span>
            </div>
            <div className="mt-2.5 h-1.5 overflow-hidden rounded bg-[#0c1216]">
              <div
                className="h-full bg-emerald-400 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-[#8e99a2]">
              {status.data?.engines.map((e) => (
                <span
                  key={e.engine}
                  className="rounded border border-[#22303a] bg-[#0c1216] px-2 py-0.5 font-mono"
                >
                  {e.engine}: {e.status}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        {/* Core Methodology Metric Cards */}
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {[
            {
              label: "Claim Integrity",
              value: metrics?.claimIntegrity,
              color: "text-emerald-400",
              help: "Composite score evaluating coverage, independence, consistency, freshness, and claim specificity.",
            },
            {
              label: "Evidence Coverage",
              value: metrics?.evidenceCoverage,
              color: "text-[#f4f1ea]",
              help: "Share of structured evidence needs addressed by usable retrieved sources.",
            },
            {
              label: "Source Independence",
              value: metrics?.sourceIndependence,
              color: "text-[#f4f1ea]",
              help: "Discounted share of genuinely distinct publishers; multiple links from the same domain or wire syndication are clustered.",
            },
            {
              label: "Evidence Conflict",
              value: metrics?.evidenceConflict,
              color: metrics?.evidenceConflict && metrics.evidenceConflict > 0 ? "text-rose-400" : "text-[#8e99a2]",
              help: "Share of polarized evidence contradicting the claim. 0% indicates no qualifying contradictions were detected in retrieved evidence, not that the claim is proven true.",
            },
            {
              label: "Claim Specificity",
              value: metrics?.claimSpecificity,
              color: "text-amber-300",
              help: "Density of verifiable metrics, baselines, target years, boundaries, and measurable propositions across claims.",
            },
            {
              label: "Evidence Gap",
              value: metrics?.evidenceGap,
              color: metrics?.evidenceGap && metrics.evidenceGap > 50 ? "text-amber-400" : "text-emerald-400",
              help: "Proportion of applicable verification requirements unresolved by retrieved public evidence. 0% means all identified aspects are addressed.",
            },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded border border-[#22303a] bg-[#121a20] p-4 text-xs"
              title={item.help}
            >
              <p className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-[#8e99a2]">
                {item.label}
                <Info size={11} className="opacity-60" />
              </p>
              <p className={`mt-2 font-mono text-2xl font-semibold tracking-tight ${item.color}`}>
                {formatPct(item.value)}
              </p>
              <p className="mt-2 text-[10px] leading-relaxed text-[#8e99a2]/80 line-clamp-2">
                {item.help}
              </p>
            </div>
          ))}
        </section>

        {/* Main 2-Column Investigation View */}
        <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          {/* Claim Register */}
          <section className="rounded border border-[#22303a] bg-[#121a20] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#22303a] pb-3.5">
              <div>
                <span className="font-mono text-[10px] uppercase tracking-widest text-[#34d399]">
                  EVIDENCE-GROUNDED PROPOSITIONS
                </span>
                <h2 className="mt-1 font-serif text-lg font-medium text-[#f4f1ea]">
                  Claim Register ({claims.length})
                </h2>
              </div>

              <div className="flex items-center gap-2">
                <label htmlFor="claim-filter" className="sr-only">Filter claims by status</label>
                <select
                  id="claim-filter"
                  className="rounded border border-[#22303a] bg-[#0c1216] px-2.5 py-1 text-xs text-[#f4f1ea] focus-ring"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value as ClaimStatus | "ALL")}
                >
                  <option value="ALL">All Statuses</option>
                  <option value="SUPPORTED">Supported</option>
                  <option value="PARTIALLY_SUPPORTED">Partially Supported</option>
                  <option value="EVIDENCE_CONFLICT">Evidence Conflict</option>
                  <option value="INSUFFICIENT_EVIDENCE">Insufficient Evidence</option>
                  <option value="NEEDS_HUMAN_REVIEW">Needs Human Review</option>
                </select>
              </div>
            </div>

            <div className="mt-4 space-y-2.5">
              {claims.length ? (
                claims.map((claim) => (
                  <Link
                    key={claim.id}
                    to={`/audit/${id}/claim/${claim.id}`}
                    className="group block rounded border border-[#22303a] bg-[#0c1216] p-4 transition-colors hover:border-[#3e7b5c] hover:bg-[#0e171c] focus-ring"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2.5">
                      <span className="text-sm font-medium leading-snug text-[#f4f1ea] group-hover:text-emerald-300">
                        {claim.text}
                      </span>
                      <StatusBadge status={claim.status} />
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-[#8e99a2]">
                      <span className="text-stone-400 uppercase tracking-wider">{claim.category}</span>
                      <span>·</span>
                      <span>Integrity: {formatPct(claim.integrityScore)}</span>
                      <span>·</span>
                      <span>Specificity: {formatPct(claim.specificityScore)}</span>
                      {claim.sourceName ? (
                        <>
                          <span>·</span>
                          <span className="text-stone-400">Src: {claim.sourceName}</span>
                        </>
                      ) : null}
                    </div>
                  </Link>
                ))
              ) : (
                <div className="py-12 text-center text-xs text-[#8e99a2]">
                  {isRunning
                    ? "Evaluating candidate claims against retrieved evidence…"
                    : "No claims matched the selected status filter."}
                </div>
              )}
            </div>
          </section>

          {/* Telemetry and Navigation Sidebar */}
          <aside className="space-y-6">
            <section className="rounded border border-[#22303a] bg-[#121a20] p-5">
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#34d399]">
                AUDIT TELEMETRY
              </span>
              <div className="mt-3.5 space-y-2.5 text-xs">
                <div className="flex justify-between border-b border-[#22303a]/60 pb-1.5">
                  <span className="text-[#8e99a2]">Usable Evidence Items</span>
                  <span className="font-mono font-medium text-[#f4f1ea]">{metrics?.evidenceCount ?? 0}</span>
                </div>
                <div className="flex justify-between border-b border-[#22303a]/60 pb-1.5">
                  <span className="text-[#8e99a2]">Distinct Sources</span>
                  <span className="font-mono font-medium text-[#f4f1ea]">{metrics?.sourceCount ?? 0}</span>
                </div>
                <div className="flex justify-between border-b border-[#22303a]/60 pb-1.5">
                  <span className="text-[#8e99a2]">Search Credit Budget</span>
                  <span className="font-mono font-medium text-[#f4f1ea]">
                    {credits.used} used / {credits.remaining} left
                  </span>
                </div>
                <div className="flex justify-between border-b border-[#22303a]/60 pb-1.5">
                  <span className="text-[#8e99a2]">Cached Query Hits</span>
                  <span className="font-mono font-medium text-[#f4f1ea]">{credits.cached} (0 credits)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#8e99a2]">Engine Coverage</span>
                  <span className="font-mono text-[#f4f1ea]">
                    {(metrics?.enginesUsed ?? []).join(", ") || "None"}
                  </span>
                </div>
              </div>
            </section>

            <nav className="rounded border border-[#22303a] bg-[#121a20] p-5">
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#34d399]">
                JUMP TO INSPECTION VIEW
              </span>
              <div className="mt-3 grid gap-2 text-xs">
                <a
                  className="flex items-center gap-2 rounded border border-[#22303a] bg-[#0c1216] px-3 py-2 text-[#f4f1ea] hover:border-[#3e7b5c] transition-colors focus-ring"
                  href="#graph"
                >
                  <Network size={14} className="text-[#34d399]" />
                  <span>Evidence Graph ({graph.data?.nodes.length ?? 0} nodes)</span>
                </a>
                <a
                  className="flex items-center gap-2 rounded border border-[#22303a] bg-[#0c1216] px-3 py-2 text-[#f4f1ea] hover:border-[#3e7b5c] transition-colors focus-ring"
                  href="#timeline"
                >
                  <Calendar size={14} className="text-amber-300" />
                  <span>Claim Timeline ({timeline.data?.events.length ?? 0} events)</span>
                </a>
                <a
                  className="flex items-center gap-2 rounded border border-[#22303a] bg-[#0c1216] px-3 py-2 text-[#f4f1ea] hover:border-[#3e7b5c] transition-colors focus-ring"
                  href="#trace"
                >
                  <Search size={14} className="text-sky-300" />
                  <span>Search Audit Trace ({trace.data?.requests.length ?? 0} requests)</span>
                </a>
              </div>
            </nav>
          </aside>
        </div>

        {/* Section: Evidence Graph */}
        <section id="graph" className="rounded border border-[#22303a] bg-[#121a20] p-5">
          <div className="mb-4">
            <span className="font-mono text-[10px] uppercase tracking-widest text-[#34d399]">
              RELATIONSHIP TOPOLOGY
            </span>
            <h2 className="mt-1 font-serif text-lg font-medium text-[#f4f1ea]">
              Evidence Graph
            </h2>
            <p className="mt-1 text-xs text-[#8e99a2]">
              Displays the verified relationship chain from Company → Claim → Subclaim → Evidence → Source. By default, highlights the selected claim subgraph.
            </p>
          </div>
          <EvidenceGraphView graph={graph.data} />
        </section>

        {/* Section: Claim Evolution Timeline */}
        <section id="timeline" className="rounded border border-[#22303a] bg-[#121a20] p-5">
          <div className="border-b border-[#22303a] pb-3">
            <span className="font-mono text-[10px] uppercase tracking-widest text-[#34d399]">
              CHRONOLOGICAL EVENTS
            </span>
            <h2 className="mt-1 font-serif text-lg font-medium text-[#f4f1ea]">
              Claim Evolution Timeline
            </h2>
            <p className="mt-1 text-xs text-[#8e99a2]">
              Chronological sequence of publication dates and attributed developments across claims.
            </p>
          </div>

          <div className="mt-5 space-y-3">
            {timeline.data?.events.length ? (
              timeline.data.events.map((event) => (
                <div
                  key={event.id}
                  className="relative border-l-2 border-[#2d5a43] pl-4 text-xs py-1 transition-colors hover:border-[#34d399]"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] font-medium text-[#34d399]">
                      {formatDate(event.eventDate)}
                    </span>
                    {event.note ? (
                      <span className="rounded bg-[#162028] px-1.5 py-0.5 text-[10px] text-[#8e99a2]">
                        {event.note}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 font-medium text-[#f4f1ea]">{event.text}</p>
                  {event.sourceUrl ? (
                    <a
                      href={event.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-[11px] text-[#34d399] hover:underline"
                    >
                      Inspect Source <ExternalLink size={10} />
                    </a>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="py-6 text-center text-xs text-[#8e99a2]">
                No dated chronological events were extracted for this audit.
              </p>
            )}
          </div>
        </section>

        {/* Section: Search Audit Trace */}
        <section id="trace" className="rounded border border-[#22303a] bg-[#121a20] p-5">
          <div className="border-b border-[#22303a] pb-3">
            <span className="font-mono text-[10px] uppercase tracking-widest text-[#34d399]">
              API BUDGET & RETRIEVAL TELEMETRY
            </span>
            <h2 className="mt-1 font-serif text-lg font-medium text-[#f4f1ea]">
              Search Trace
            </h2>
            <p className="mt-1 text-xs text-[#8e99a2]">
              Full audit trace of every query executed, credit consumption, and response outcome. Timed out or failed searches are explicitly recorded and consumed zero evidence weight.
            </p>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-xs">
              <thead>
                <tr className="border-b border-[#22303a] font-mono text-[10px] uppercase text-[#8e99a2]">
                  <th className="pb-2.5">Engine</th>
                  <th className="pb-2.5">Executed Query</th>
                  <th className="pb-2.5">Outcome</th>
                  <th className="pb-2.5">Results</th>
                  <th className="pb-2.5">Credits</th>
                  <th className="pb-2.5">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#22303a]/50">
                {trace.data?.requests.map((r) => {
                  const isTimeout = r.status === "timeout";
                  const isSuccess = r.status === "success";
                  const isCached = r.cached;

                  return (
                    <tr key={r.id} className="hover:bg-[#162028]/40">
                      <td className="py-2.5 font-mono text-[11px] text-emerald-400">
                        {r.engine}
                      </td>
                      <td className="py-2.5 pr-4 text-[#f4f1ea] max-w-xs truncate" title={r.query}>
                        {r.query}
                      </td>
                      <td className="py-2.5">
                        <span
                          className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase ${
                            isSuccess
                              ? "bg-emerald-950/60 text-emerald-300 border border-emerald-800/40"
                              : isCached
                              ? "bg-stone-900 text-stone-300 border border-stone-700/40"
                              : isTimeout
                              ? "bg-amber-950/60 text-amber-300 border border-amber-800/40"
                              : "bg-rose-950/60 text-rose-300 border border-rose-800/40"
                          }`}
                        >
                          {STATUS_LABELS[r.status] ?? r.status}
                        </span>
                      </td>
                      <td className="py-2.5 font-mono text-[#8e99a2]">{r.resultCount}</td>
                      <td className="py-2.5 font-mono">
                        {r.cached ? (
                          <span className="text-stone-400">0 (cached)</span>
                        ) : (
                          <span className={r.creditsUsed > 0 ? "text-amber-300" : "text-stone-400"}>
                            {r.creditsUsed}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 font-mono text-[10px] text-[#8e99a2]">
                        {new Date(r.requestedAt).toLocaleTimeString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </Shell>
  );
}
