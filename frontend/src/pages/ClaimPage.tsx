import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, AlertTriangle } from "lucide-react";
import type { Evidence } from "@ecotrace/shared";
import { api } from "../api";
import { Shell } from "../components/Shell";
import { StatusBadge } from "../components/StatusBadge";
import { formatDate, formatPct } from "../lib/labels";

// ─── Source type badge colours ────────────────────────────────────────────────
// Each source type gets a distinct colour so new engines (AD_CLAIM, PATENT etc.)
// are immediately visible in the evidence ledger.
const SOURCE_TYPE_STYLES: Record<string, string> = {
  AD_CLAIM:         "border-red-700/70 bg-red-950/50 text-red-300",
  PATENT:           "border-blue-700/70 bg-blue-950/50 text-blue-300",
  FORUM:            "border-purple-700/70 bg-purple-950/50 text-purple-300",
  VIDEO_TRANSCRIPT: "border-orange-700/70 bg-orange-950/50 text-orange-300",
  SCIENTIFIC:       "border-cyan-700/70 bg-cyan-950/50 text-cyan-300",
  ACADEMIC:         "border-cyan-700/70 bg-cyan-950/50 text-cyan-300",
  GOVERNMENT:       "border-teal-700/70 bg-teal-950/50 text-teal-300",
  NGO:              "border-lime-700/70 bg-lime-950/50 text-lime-300",
  NEWS:             "border-sky-700/70 bg-sky-950/50 text-sky-300",
  OFFICIAL_COMPANY: "border-amber-700/70 bg-amber-950/50 text-amber-300",
  PRODUCT:          "border-violet-700/70 bg-violet-950/50 text-violet-300",
  INDUSTRY:         "border-stone-600/70 bg-stone-900/60 text-stone-300",
  BLOG:             "border-stone-600/70 bg-stone-900/60 text-stone-400",
  OTHER:            "border-stone-600/70 bg-stone-900/60 text-stone-400",
};

type RelationFilter = "ALL" | "SUPPORTING" | "CONTRADICTING" | "MIXED" | "INSUFFICIENT";

// ─── Evidence Ledger with filter toggle ───────────────────────────────────────
function EvidenceLedger({ evidence }: { evidence: Evidence[] }) {
  const [filter, setFilter] = useState<RelationFilter>("ALL");

  const counts = {
    ALL: evidence.length,
    SUPPORTING: evidence.filter((e) => e.relation === "SUPPORTING").length,
    CONTRADICTING: evidence.filter((e) => e.relation === "CONTRADICTING").length,
    MIXED: evidence.filter((e) => e.relation === "MIXED").length,
    INSUFFICIENT: evidence.filter((e) => e.relation === "INSUFFICIENT").length,
  };

  const visible = filter === "ALL" ? evidence : evidence.filter((e) => e.relation === filter);

  const filterBtns: { key: RelationFilter; label: string; activeClass: string }[] = [
    { key: "ALL",           label: `All (${counts.ALL})`,                     activeClass: "border-[#34d399] bg-[#14231b] text-emerald-300" },
    { key: "SUPPORTING",    label: `Supporting (${counts.SUPPORTING})`,        activeClass: "border-emerald-700 bg-emerald-950/60 text-emerald-300" },
    { key: "CONTRADICTING", label: `Contradicting (${counts.CONTRADICTING})`,  activeClass: "border-rose-700 bg-rose-950/60 text-rose-300" },
    { key: "MIXED",         label: `Mixed (${counts.MIXED})`,                  activeClass: "border-amber-700 bg-amber-950/60 text-amber-300" },
    { key: "INSUFFICIENT",  label: `Insufficient (${counts.INSUFFICIENT})`,    activeClass: "border-stone-600 bg-stone-900/60 text-stone-300" },
  ];

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#22303a] pb-3">
        <div>
          <span className="font-mono text-[10px] uppercase tracking-widest text-[#34d399]">
            CORROBORATION LEDGER
          </span>
          <h2 className="mt-1 font-serif text-lg font-medium text-[#f4f1ea]">
            Retrieved Public Evidence
          </h2>
        </div>
        <span className="font-mono text-xs text-[#8e99a2]">
          {visible.length} of {evidence.length} items
        </span>
      </div>

      {/* Filter toggle */}
      <div className="flex flex-wrap gap-1.5">
        {filterBtns.map((btn) => (
          <button
            key={btn.key}
            type="button"
            onClick={() => setFilter(btn.key)}
            className={`rounded border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${
              filter === btn.key
                ? btn.activeClass
                : "border-[#22303a] bg-[#0c1216] text-[#8e99a2] hover:border-[#384d5c] hover:text-[#f4f1ea]"
            }`}
          >
            {btn.label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {visible.length === 0 ? (
          <p className="py-8 text-center text-xs text-[#8e99a2]">
            No evidence items match the selected filter.
          </p>
        ) : (
          visible.map((item) => {
            const relColor =
              item.relation === "SUPPORTING"
                ? "border-emerald-800/60 bg-emerald-950/40 text-emerald-300"
                : item.relation === "CONTRADICTING"
                ? "border-rose-800/60 bg-rose-950/40 text-rose-300"
                : item.relation === "MIXED"
                ? "border-amber-800/60 bg-amber-950/40 text-amber-300"
                : "border-stone-700/60 bg-stone-900/60 text-stone-300";

            const sourceTypeBadge =
              SOURCE_TYPE_STYLES[item.sourceType] ??
              "border-stone-600/70 bg-stone-900/60 text-stone-400";

            return (
              <article
                key={item.id}
                className="rounded border border-[#22303a] bg-[#121a20] p-5 text-xs transition-colors hover:border-[#384d5c]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Relation badge */}
                    <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase font-medium border ${relColor}`}>
                      {item.relation}
                    </span>
                    {/* Source type badge — distinct colour per type */}
                    <span className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase font-medium ${sourceTypeBadge}`}>
                      {item.sourceType.replace(/_/g, " ")}
                    </span>
                    {/* Engine badge */}
                    <span className="rounded border border-[#22303a] bg-[#0c1216] px-1.5 py-0.5 font-mono text-[10px] text-[#8e99a2]">
                      {item.engine.replace(/_/g, " ")}
                    </span>
                    <span className="font-mono text-[10px] text-[#8e99a2]">
                      {formatDate(item.publishedAt)}
                    </span>
                  </div>

                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-[#34d399] hover:underline"
                  >
                    <span className="truncate max-w-[140px]">{item.domain}</span>
                    <ExternalLink size={12} />
                  </a>
                </div>

                <h3 className="mt-2.5 font-serif text-base font-medium text-[#f4f1ea]">
                  {item.title}
                </h3>

                <p className="mt-2 text-xs leading-relaxed text-[#8e99a2]">
                  "{item.snippet}"
                </p>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#22303a]/60 pt-2.5 text-[11px] text-[#8e99a2]">
                  <p className="text-[#f4f1ea]/80">
                    <span className="text-[#8e99a2]">Rationale:</span> {item.explanation}
                  </p>
                  <div className="flex items-center gap-3 font-mono text-[10px]">
                    <span>Relevance: {formatPct(item.relevanceScore)}</span>
                    <span>Independence: {formatPct(item.independenceScore)}</span>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}

export function ClaimPage() {
  const { id = "", claimId = "" } = useParams();
  const query = useQuery({
    queryKey: ["claim", claimId],
    queryFn: () => api.getClaim(claimId),
    enabled: Boolean(claimId),
  });

  if (query.isLoading || !query.data) {
    return (
      <Shell>
        <div className="py-24 text-center">
          <p className="font-mono text-xs uppercase tracking-widest text-[#34d399]">
            CLAIM DOSSIER
          </p>
          <p className="mt-2 text-sm text-[#8e99a2]">Loading claim corroboration ledger…</p>
        </div>
      </Shell>
    );
  }

  const { claim, subclaims, evidence, gap, events } = query.data;

  return (
    <Shell>
      <div className="space-y-6">
        <Link
          to={`/audit/${id}`}
          className="inline-flex items-center gap-1.5 text-xs text-[#8e99a2] hover:text-[#f4f1ea] transition-colors focus-ring"
        >
          <ArrowLeft size={14} />
          <span>Return to Audit Overview</span>
        </Link>

        {/* Claim Dossier Header */}
        <header className="border-b border-[#22303a] pb-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-[10px] uppercase tracking-widest text-[#34d399]">
              CLAIM REGISTER / {claim.category}
            </span>
            <StatusBadge status={claim.status} />
          </div>

          <h1 className="mt-3.5 max-w-4xl font-serif text-2xl font-medium tracking-tight text-[#f4f1ea] sm:text-3xl sm:leading-snug">
            {claim.text}
          </h1>

          {claim.sourceUrl ? (
            <div className="mt-2.5 flex items-center gap-2 text-xs text-[#8e99a2]">
              <span>Reported via:</span>
              <a
                href={claim.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[#34d399] hover:underline"
              >
                {claim.sourceName || new URL(claim.sourceUrl).hostname}
                <ExternalLink size={11} />
              </a>
            </div>
          ) : (
            <p className="mt-2 text-xs text-[#8e99a2]">Direct attribution source: Unspecified public record</p>
          )}

          <p className="mt-3.5 max-w-3xl text-xs leading-relaxed text-[#8e99a2]">
            {claim.explanation ??
              "This claim proposition is evaluated against retrieved public evidence across multiple search surfaces."}
          </p>
        </header>

        {/* Indicator Summary Cards */}
        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded border border-[#22303a] bg-[#121a20] p-4 text-xs">
            <span className="font-mono text-[10px] uppercase tracking-wider text-[#8e99a2]">
              Claim Integrity Indicator
            </span>
            <p className="mt-2 font-mono text-2xl font-semibold text-emerald-400">
              {formatPct(claim.integrityScore)}
            </p>
            <p className="mt-1.5 text-[10px] text-[#8e99a2]">
              Weighted composite of coverage, independence, and consistency.
            </p>
          </div>

          <div className="rounded border border-[#22303a] bg-[#121a20] p-4 text-xs">
            <span className="font-mono text-[10px] uppercase tracking-wider text-[#8e99a2]">
              Claim Specificity Score
            </span>
            <p className="mt-2 font-mono text-2xl font-semibold text-amber-300">
              {formatPct(claim.specificityScore)}
            </p>
            <p className="mt-1.5 text-[10px] text-[#8e99a2]">
              Density of quantifiable metrics, deadlines, baselines, and scope.
            </p>
          </div>

          <div className="rounded border border-[#22303a] bg-[#121a20] p-4 text-xs">
            <span className="font-mono text-[10px] uppercase tracking-wider text-[#8e99a2]">
              Retrieved Evidence Items
            </span>
            <p className="mt-2 font-mono text-2xl font-semibold text-[#f4f1ea]">
              {evidence.length}
            </p>
            <p className="mt-1.5 text-[10px] text-[#8e99a2]">
              Public search snippets evaluated for support or conflict.
            </p>
          </div>
        </section>

        {/* Atomic Subclaims Breakdown */}
        <section className="rounded border border-[#22303a] bg-[#121a20] p-5">
          <div className="border-b border-[#22303a] pb-3">
            <span className="font-mono text-[10px] uppercase tracking-widest text-[#34d399]">
              DECOMPOSITION
            </span>
            <h2 className="mt-1 font-serif text-lg font-medium text-[#f4f1ea]">
              Atomic Subclaims ({subclaims.length})
            </h2>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {subclaims.map((item) => (
              <div
                key={item.id}
                className="rounded border border-[#22303a] bg-[#0c1216] p-4 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] uppercase text-[#8e99a2]">
                    {item.category}
                  </span>
                  <StatusBadge status={item.status} />
                </div>
                <p className="mt-2 font-medium text-[#f4f1ea] leading-snug">{item.text}</p>
                <p className="mt-2 text-[11px] text-[#8e99a2] border-t border-[#22303a]/60 pt-2">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-stone-400">
                    Verification Test:
                  </span>{" "}
                  {item.testQuestion}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Evidence Gap Flag if present */}
        {gap && gap.missing?.length ? (
          <section className="rounded border border-amber-800/50 bg-amber-950/20 p-5 text-xs">
            <div className="flex items-center gap-2 text-amber-300 font-medium">
              <AlertTriangle size={15} />
              <span>Identified Evidence Gap</span>
            </div>
            <p className="mt-2 text-amber-200/90 leading-relaxed">
              {gap.requiredToSubstantiate}
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-[#8e99a2]">
              {gap.missing.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Evidence Ledger Section */}
        <EvidenceLedger evidence={evidence} />

        {/* Claim Timeline Section */}
        {events && events.length ? (
          <section className="rounded border border-[#22303a] bg-[#121a20] p-5">
            <div className="border-b border-[#22303a] pb-3">
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#34d399]">
                TIMELINE
              </span>
              <h2 className="mt-1 font-serif text-lg font-medium text-[#f4f1ea]">
                Claim Chronology
              </h2>
            </div>

            <div className="mt-4 space-y-3">
              {events.map((event) => (
                <div
                  key={event.id}
                  className="border-l-2 border-[#2d5a43] pl-4 py-1 text-xs"
                >
                  <span className="font-mono text-[11px] font-medium text-[#34d399]">
                    {formatDate(event.eventDate)}
                  </span>
                  <p className="mt-1 font-medium text-[#f4f1ea]">{event.text}</p>
                  {event.sourceUrl ? (
                    <a
                      href={event.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-[11px] text-[#34d399] hover:underline"
                    >
                      View Source <ExternalLink size={10} />
                    </a>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </Shell>
  );
}
