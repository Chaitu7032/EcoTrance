const STOP = new Set([
  "the", "and", "for", "with", "this", "that", "from", "was", "were", "are", "has", "have", "had",
  "been", "being", "will", "would", "shall", "should", "could", "about", "into", "over", "after"
]);

/**
 * Deterministic claim specificity score (0.0 to 1.0).
 * Evaluates whether a claim contains testable propositions:
 * 1. Identifiable entity / claimant (no hardcoded company exceptions)
 * 2. Quantitative metric or ratio (percentages, quantities, absolute volumes, net-zero)
 * 3. Specific environmental metric / topic (Scope 1-3, emissions, recycled content, renewable)
 * 4. Temporal anchor or reporting period (calendar year, FY, baseline year, target deadline)
 * 5. Scope or geographic operational boundary (supply chain, stores, regions, operations)
 * 6. Action / commitment verb (reduced, achieved, committed, targeting, eliminated)
 */
export function calculateSpecificity(text: string): number {
  const value = text.trim();
  if (!value || value.length < 8) return 0;

  // Interrogatives or title-only fragments have zero or negligible specificity
  if (value.endsWith("?") || /^(?:what|how|why|who|is|are|do|does)\s/i.test(value)) {
    return 0;
  }

  const checks = [
    // 1. Identifiable entity or corporate subject
    /\b(?:[A-Z][a-z0-9]+(?:\s+[A-Z][a-z0-9]+)*|company|corporation|group|retailer|brand|supplier|manufacturer|we|our)\b/i,
    // 2. Concrete quantity, ratio, or absolute metric
    /\b(?:\d+(?:\.\d+)?\s*(?:%|percent|million|billion|tonnes?|tons?|kg|g|lit(?:er|re)s?|mwh|gwh|kwh|mw|gw|hectares?)|\b(?:100%|zero|net[- ]?zero|halve|double)\b)/i,
    // 3. Environmental topic or reporting metric
    /\b(?:carbon|emissions?|ghg|footprint|energy|electricity|materials?|polyester|cotton|water|effluent|waste|packaging|recycled|renewable|solar|wind|biodiversity|deforestation|scope\s*[123])\b/i,
    // 4. Temporal anchor or reporting period
    /\b(?:fy\s?\d{2,4}|q[1-4]|20\d{2}|19\d{2}|by\s+20\d{2}|since\s+20\d{2}|baseline(?:\s+year)?|target\s+year|annually|per\s+year)\b/i,
    // 5. Geographic or operational scope
    /\b(?:in|across|within|throughout)\s+(?:global|europe|asia|north america|worldwide|operations?|stores?|supply chain|value chain|fleet|facilities?|[A-Z][\w-]*)\b/i,
    // 6. Measurable action or commitment verb
    /\b(?:target(?:s|ing)?|goal|aim(?:s|ing)?|commit(?:s|ted|ment)?|achiev(?:ed|ing)?|reduc(?:ed|ing)?|cut|halv(?:ed|ing)|eliminat(?:ed|ing)|sourc(?:ed|ing)|transition(?:ed|ing)?)\b/i,
  ];

  const hits = checks.filter((re) => re.test(value)).length;
  const meaningfulWords = value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP.has(w));

  // Minimum substantive word density requirement
  if (meaningfulWords.length < 3 && hits < 2) {
    return 0;
  }

  const hitScore = (hits / checks.length) * 0.8;
  const contentScore = (Math.min(meaningfulWords.length, 12) / 12) * 0.2;
  const rawScore = hitScore + contentScore;

  // Scale safely into 0..1 range with 3 decimal places
  return Math.min(1, Math.max(0, Math.round(rawScore * 1000) / 1000));
}
