export const STAGE_LABELS: Record<string, string> = {
  queued: "Queued",
  resolving_entity: "Resolving company entity",
  discovering_claims: "Discovering claims",
  decomposing_claims: "Decomposing claims",
  planning_queries: "Planning queries",
  searching_independent: "Searching independent sources",
  analyzing_news: "Analyzing news",
  testing_scientific: "Testing scientific evidence",
  checking_products: "Checking product signals",
  analyzing_trends: "Analyzing search trends",
  normalizing_evidence: "Normalizing evidence",
  building_graph: "Building evidence graph",
  calculating_integrity: "Calculating claim integrity",
  completed: "Completed",
};

export const ENGINE_LABELS: Record<string, string> = {
  google: "Google Search",
  google_news: "Google News",
  google_scholar: "Google Scholar",
  google_shopping: "Google Shopping",
  google_trends: "Google Trends",
};

export const STATUS_LABELS: Record<string, string> = {
  success: "Found",
  cached: "Cached",
  no_results: "No useful results",
  recovered: "Recovered",
  invalid_query: "Query adjusted",
  timeout: "Timed out",
  network_error: "Network issue",
  provider_error: "Provider unavailable",
  rate_limited: "Temporarily limited",
  auth_error: "Configuration issue",
  unknown_error: "Search unavailable",
  SUPPORTED: "Supported",
  PARTIALLY_SUPPORTED: "Partially Supported",
  EVIDENCE_CONFLICT: "Evidence Conflict",
  INSUFFICIENT_EVIDENCE: "Insufficient Evidence",
  NEEDS_HUMAN_REVIEW: "Needs Human Review",
  PENDING: "Pending Evaluation",
};

export function statusColor(status: string): string {
  switch (status) {
    case "SUPPORTED":
      return "text-emerald-400";
    case "PARTIALLY_SUPPORTED":
      return "text-amber-300";
    case "EVIDENCE_CONFLICT":
      return "text-rose-400";
    case "NEEDS_HUMAN_REVIEW":
      return "text-orange-300";
    case "INSUFFICIENT_EVIDENCE":
      return "text-stone-400";
    default:
      return "text-stone-400";
  }
}

/**
 * Normalizes and formats percentage values across 0..1 floats and 0..100 integers consistently.
 */
export function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) {
    return "—";
  }
  // Value stored on 0..1 scale (with non-zero decimal or strictly <= 1 and > 0)
  if (value > 0 && value <= 1) {
    return `${Math.round(value * 100)}%`;
  }
  return `${Math.round(value)}%`;
}

/**
 * Formats dates safely, distinguishing stated publication dates from unstated ones.
 */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr || dateStr === "unknown") {
    return "Date unstated";
  }
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr.slice(0, 10);
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return dateStr.slice(0, 10);
  }
}

export const DISCLAIMER =
  "EcoTrace is an analytical research tool. Its results are based on publicly available information and automated evidence analysis. Results are not legal, regulatory, scientific certification, or proof of wrongdoing. Human review is recommended for consequential decisions.";
