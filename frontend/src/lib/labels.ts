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
  auth_error: "Search configuration issue",
  unknown_error: "Search unavailable",
  SUPPORTED: "Supported",
  PARTIALLY_SUPPORTED: "Partially Supported",
  EVIDENCE_CONFLICT: "Evidence Conflict",
  INSUFFICIENT_EVIDENCE: "Insufficient Evidence",
  NEEDS_HUMAN_REVIEW: "Needs Human Review",
  PENDING: "Pending",
};

export function statusColor(status: string): string {
  switch (status) {
    case "SUPPORTED":
      return "text-accent";
    case "PARTIALLY_SUPPORTED":
      return "text-warn";
    case "EVIDENCE_CONFLICT":
      return "text-conflict";
    case "NEEDS_HUMAN_REVIEW":
      return "text-amber-200";
    default:
      return "text-mist";
  }
}

export const DISCLAIMER =
  "EcoTrace is an analytical research tool. Its results are based on publicly available information and automated evidence analysis. Results are not legal, regulatory, scientific certification, or proof of wrongdoing. Human review is recommended for consequential decisions.";
