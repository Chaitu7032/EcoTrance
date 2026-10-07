export function MethodologyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
      <div className="glass max-h-[90vh] w-full max-w-2xl overflow-auto rounded-md p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-mono text-sm tracking-[0.2em] text-accent">HOW ECOTRACE WORKS</h2>
          <button className="focus-ring text-mist" onClick={onClose} type="button">
            Close
          </button>
        </div>
        <ol className="space-y-3 text-sm text-mist">
          <li>1. Public environmental claims are discovered from live search surfaces.</li>
          <li>2. Broad claims are decomposed into atomic, testable subclaims.</li>
          <li>3. A query planner generates targeted support and conflict searches.</li>
          <li>4. Evidence is retrieved through SerpApi (Search, News, Scholar, Shopping, Trends).</li>
          <li>5. Sources are normalized, de-duplicated, and clustered for independence.</li>
          <li>6. Each evidence item is classified against the claim — not against an AI prior.</li>
          <li>7. Conflicts, coverage gaps, freshness, and specificity are scored transparently.</li>
          <li>8. The Claim Integrity Indicator is a weighted research metric, not a greenwashing verdict.</li>
        </ol>
        <p className="mt-5 text-xs text-mist/70">
          Weighting: 0.30 coverage + 0.25 independence + 0.20 consistency + 0.15 freshness + 0.10 specificity.
        </p>
      </div>
    </div>
  );
}
