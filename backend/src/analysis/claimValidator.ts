import type { ClaimCategory } from "@ecotrace/shared";
import { calculateSpecificity } from "../scoring/specificity.js";

export interface ClaimValidationResult {
  isValid: boolean;
  cleanText: string;
  rejectionReason: string | null;
  category: ClaimCategory;
  claimant: string | null;
  claimantType: "CORPORATE_OFFICIAL" | "INDEPENDENT_REPORTING" | "SCIENTIFIC" | "CIVIL_SOCIETY_OR_NGO" | "UNATTRIBUTED";
  hasMetrics: boolean;
  hasTemporalScope: boolean;
  hasOperationalScope: boolean;
  specificityScore: number;
}

const QUESTION_PATTERNS = [
  /\?$/,
  /^(?:what|how|why|who|where|when|is|are|do|does|can|could|should|would|did)\s/i,
  /\b(?:what are your thoughts|what do you think|survey|questionnaire|discussion)\b/i,
];

const NAVIGATION_AND_PROMOTIONAL_PATTERNS = [
  /^(?:sustainability stories|stories\s*[-–—]|news\s*[-–—]|sustainability\s*[-–—])/i,
  /[-–—]\s*(?:ikea global|home|about us|sustainability overview|official site)$/i,
  /^(?:why\s+[A-Za-z0-9\s]+\s+is\s+a\s+(?:sustainability\s+)?leader)$/i,
  /^(?:our approach|our commitment|overview|read more|contact us|careers|investor relations)$/i,
  /^(?:home|about\s+us|sustainability|corporate social responsibility|csr)$/i,
];

const TRUNCATED_OR_FRAGMENT_PATTERNS = [
  /\b(?:accused\s+of|committed\s+to|responsible\s+for|working\s+on|leading\s+in|impact\s+of|supplier\s+in)\s+[a-z]+\s*\.$/i,
  /\b(?:accused\s+of\s+environmental|in\s+terms\s+of|due\s+to|because\s+of)\s*\.?$/i,
  /\.\.\.$/,
  /\s[-–—:]\s*$/,
];

const SEARCH_ARTIFACT_PATTERNS = [
  /^(?:google|bing|search|results?|query|serpapi)\b/i,
  /\b(?:official website|sustainability claims|environmental claims)\b/i,
];

const TOPIC_PATTERNS: Array<{ re: RegExp; category: ClaimCategory }> = [
  { re: /\b(?:carbon|net[- ]?zero|emissions?|ghg|decarboniz|offsetting)\b/i, category: "CARBON" },
  { re: /\b(?:renewable energy|clean energy|electricity|solar|wind|power consumption)\b/i, category: "ENERGY" },
  { re: /\b(?:recycled|polyester|cotton|raw materials?|feedstock|bio[- ]based)\b/i, category: "MATERIALS" },
  { re: /\b(?:packaging|plastic packaging|boxes|corrugated|single[- ]use)\b/i, category: "PACKAGING" },
  { re: /\b(?:water|effluent|freshwater|water stewardship)\b/i, category: "WATER" },
  { re: /\b(?:waste|landfill|circular|zero waste|take[- ]back)\b/i, category: "WASTE" },
  { re: /\b(?:recycling|recyclable|recycled content)\b/i, category: "RECYCLING" },
  { re: /\b(?:supply chain|tier\s*[123]|suppliers?|sourcing|procurement|logistics)\b/i, category: "SUPPLY_CHAIN" },
  { re: /\b(?:biodiversity|forests?|deforestation|wood|nature|ecosystems?)\b/i, category: "BIODIVERSITY" },
  { re: /\b(?:climate|global warming|paris agreement|1\.5|science[- ]based)\b/i, category: "CLIMATE" },
];

/**
 * Normalizes claim text to avoid duplicate company prefixes (e.g., "IKEA: IKEA: ...")
 */
export function sanitizeClaimText(rawText: string, companyName: string): string {
  let text = rawText.trim();
  // Strip duplicate leading company prefixes: "IKEA: IKEA: Foo" -> "Foo"
  const prefixRegex = new RegExp(`^(?:${escapeRegex(companyName)}[\\s:–—-]+)+`, "i");
  text = text.replace(prefixRegex, "").trim();

  // Strip leading/trailing quotation marks or bullet markers
  text = text.replace(/^["'“‘•\-\s]+|["'”’\s]+$/g, "").trim();
  return text;
}

/**
 * Validates a candidate string against source-grounded claim criteria.
 */
export function validateClaimCandidate(
  rawCandidate: string,
  companyName: string,
  sourceUrl?: string | null,
  sourceName?: string | null,
): ClaimValidationResult {
  const clean = sanitizeClaimText(rawCandidate, companyName);

  // 1. Length boundaries: a complete factual proposition must be at least 25 characters
  if (clean.length < 25) {
    return makeInvalid(clean, "Candidate is too short to express a testable proposition.");
  }

  // 2. Reject questions or survey inquiries
  for (const re of QUESTION_PATTERNS) {
    if (re.test(clean) || re.test(rawCandidate)) {
      return makeInvalid(clean, "Interrogative questions or forum survey posts are not factual claims.");
    }
  }

  // 3. Reject site navigation, section labels, or pure promotional titles
  for (const re of NAVIGATION_AND_PROMOTIONAL_PATTERNS) {
    if (re.test(clean)) {
      return makeInvalid(clean, "Website navigation labels, breadcrumbs, and promotional headlines are not claims.");
    }
  }

  // 4. Reject incomplete sentences or truncated fragments ending abruptly
  for (const re of TRUNCATED_OR_FRAGMENT_PATTERNS) {
    if (re.test(clean)) {
      return makeInvalid(clean, "Sentence fragment with incomplete proposition or dangling preposition.");
    }
  }

  // 5. Reject search queries or internal keywords
  for (const re of SEARCH_ARTIFACT_PATTERNS) {
    if (re.test(clean)) {
      return makeInvalid(clean, "Search query artifact or internal keyword text.");
    }
  }

  // 6. Check for substantive proposition (action, target, commitment, reduction, allegation, or metric)
  const hasActionVerb = /\b(?:aims?|targets?|commits?|reduced?|achieved?|cut|halved?|reaches?|using|uses?|transitioning|accused|found|reported|investigat(?:ed|ion)|launched|fined|probed?|demonstrat(?:e|es|ed|ing)|shows?|finds?)\b/i.test(clean);
  const hasMetricOrScope = /\b(?:\d+(?:\.\d+)?%|percent|million|tonnes?|net[- ]?zero|halv(?:e|ed|ing)|100%|by\s+20\d{2}|since\s+20\d{2}|scope\s*[123]|baseline)\b/i.test(clean);
  const isAttributedAllegation = /\b(?:accused of|investigat(?:ion|ed)|violat(?:ed|ing)|illegal|probe|lawsuit|fined)\b/i.test(clean) && clean.split(/\s+/).length >= 5;

  if (!hasActionVerb && !hasMetricOrScope && !isAttributedAllegation) {
    return makeInvalid(clean, "Statement lacks a testable environmental proposition, measurable metric, or attributed finding.");
  }

  // Categorize
  let category: ClaimCategory = "GENERAL_ENVIRONMENT";
  for (const topic of TOPIC_PATTERNS) {
    if (topic.re.test(clean)) {
      category = topic.category;
      break;
    }
  }

  // Determine attribution and speaker
  const provenance = determineProvenance(sourceUrl, sourceName, companyName);

  const hasMetrics = /\b(?:\d+(?:\.\d+)?%|percent|million|tonnes?|gwh|mwh|kg|net[- ]?zero|halv(?:e|ed|ing))\b/i.test(clean);
  const hasTemporalScope = /\b(?:by\s+20\d{2}|20\d{2}|fy\s?\d{2,4}|baseline)\b/i.test(clean);
  const hasOperationalScope = /\b(?:global|supply chain|stores|operations|europe|worldwide)\b/i.test(clean);
  const specificityScore = calculateSpecificity(`${companyName}: ${clean}`);

  return {
    isValid: true,
    cleanText: `${companyName}: ${clean}`,
    rejectionReason: null,
    category,
    claimant: provenance.claimant,
    claimantType: provenance.claimantType,
    hasMetrics,
    hasTemporalScope,
    hasOperationalScope,
    specificityScore,
  };
}

function makeInvalid(text: string, reason: string): ClaimValidationResult {
  return {
    isValid: false,
    cleanText: text,
    rejectionReason: reason,
    category: "GENERAL_ENVIRONMENT",
    claimant: null,
    claimantType: "UNATTRIBUTED",
    hasMetrics: false,
    hasTemporalScope: false,
    hasOperationalScope: false,
    specificityScore: 0,
  };
}

function determineProvenance(
  sourceUrl?: string | null,
  sourceName?: string | null,
  companyName?: string,
): { claimant: string | null; claimantType: ClaimValidationResult["claimantType"] } {
  if (!sourceUrl && !sourceName) {
    return { claimant: null, claimantType: "UNATTRIBUTED" };
  }

  const url = (sourceUrl ?? "").toLowerCase();
  const name = (sourceName ?? "").toLowerCase();

  if (url.includes(".edu") || url.includes("scholar") || name.includes("journal") || name.includes("institute")) {
    return { claimant: sourceName ?? "Academic Research", claimantType: "SCIENTIFIC" };
  }

  if (url.includes(".ngo") || url.includes(".org") || name.includes("greenpeace") || name.includes("watch") || name.includes("disclose")) {
    return { claimant: sourceName ?? "Civil Society / Investigative Body", claimantType: "CIVIL_SOCIETY_OR_NGO" };
  }

  if (url.includes("reuters") || url.includes("bloomberg") || url.includes("forbes") || url.includes("guardian") || url.includes("magazine") || url.includes("news")) {
    return { claimant: sourceName ?? "Independent Reporting", claimantType: "INDEPENDENT_REPORTING" };
  }

  if (companyName && (url.includes(companyName.toLowerCase().replace(/\s+/g, "")) || name.includes(companyName.toLowerCase()))) {
    return { claimant: companyName, claimantType: "CORPORATE_OFFICIAL" };
  }

  return { claimant: sourceName ?? null, claimantType: "INDEPENDENT_REPORTING" };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
