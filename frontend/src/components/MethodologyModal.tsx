import { X } from "lucide-react";

export function MethodologyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="methodology-title"
    >
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded border border-[#22303a] bg-[#121a20] p-6 text-[#f4f1ea] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#22303a] pb-4">
          <div>
            <span className="font-mono text-[10px] tracking-widest text-[#34d399] uppercase">
              RESEARCH METHODOLOGY & METRICS
            </span>
            <h2 id="methodology-title" className="mt-1 text-lg font-semibold text-[#f4f1ea]">
              How EcoTrace Stress-Tests Environmental Claims
            </h2>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="rounded p-1 text-[#8e99a2] hover:bg-[#162028] hover:text-[#f4f1ea] focus-ring"
            aria-label="Close methodology modal"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-5 space-y-5 text-xs text-[#8e99a2] leading-relaxed">
          <section>
            <h3 className="font-medium text-[#f4f1ea] text-sm mb-1.5">1. Source-Grounded Claim Validation</h3>
            <p>
              Candidates are extracted strictly from published sources. Questions, website navigation labels, promotional slogans, and truncated sentence fragments are rejected. Accepted claims must state a testable proposition (e.g. emissions target, recycled content percentage, or attributed allegation).
            </p>
          </section>

          <section>
            <h3 className="font-medium text-[#f4f1ea] text-sm mb-1.5">2. Multi-Surface Retrieval & Credit Budgeting</h3>
            <p>
              Search requests are routed through a centralized gateway strictly enforcing request caps (8 searches for Quick audit, 16 searches for Deep audit). Surfaces include Web, News, Google Scholar, Shopping listings, and Search Trends. Cached requests consume zero credits.
            </p>
          </section>

          <section>
            <h3 className="font-medium text-[#f4f1ea] text-sm mb-1.5">3. Source Independence Clustering</h3>
            <p>
              URL count does not equal corroboration. Sources are clustered by URL canonicalization and lexical similarity. Wire service syndication and multiple articles from the same publisher are discounted to prevent duplicate reporting from inflating independence scores.
            </p>
          </section>

          <section>
            <h3 className="font-medium text-[#f4f1ea] text-sm mb-1.5">4. Evidence Classification</h3>
            <p>
              Retrieved snippets are classified as Supporting, Contradicting, Mixed, Insufficient, or Irrelevant. Company-owned statements cannot corroborate corporate claims without independent external evidence.
            </p>
          </section>

          <section className="rounded border border-[#22303a] bg-[#0c1216] p-4 text-[11px]">
            <h4 className="font-mono uppercase tracking-wider text-[#34d399] mb-2">Claim Integrity Formula</h4>
            <p className="font-mono text-[#f4f1ea] mb-2">
              Claim Integrity = (0.30 × Coverage) + (0.25 × Independence) + (0.20 × Consistency) + (0.15 × Freshness) + (0.10 × Specificity)
            </p>
            <ul className="space-y-1 text-[#8e99a2]">
              <li>• <strong>Coverage (30%):</strong> Share of required subclaim evidence needs satisfied by usable sources.</li>
              <li>• <strong>Independence (25%):</strong> Share of non-corporate, non-syndicated independent sources.</li>
              <li>• <strong>Consistency (20%):</strong> Absence of retrieved contradictory evidence (1 - Contradiction Ratio).</li>
              <li>• <strong>Freshness (15%):</strong> Recency of published evidence relative to the reporting window.</li>
              <li>• <strong>Specificity (10%):</strong> Quantifiable metrics, temporal baselines, target years, and defined scopes.</li>
            </ul>
          </section>
        </div>

        <div className="mt-6 flex justify-end border-t border-[#22303a] pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-[#22303a] bg-[#162028] px-4 py-1.5 text-xs text-[#f4f1ea] hover:border-[#34d399] transition-colors"
          >
            Close Reference
          </button>
        </div>
      </div>
    </div>
  );
}
