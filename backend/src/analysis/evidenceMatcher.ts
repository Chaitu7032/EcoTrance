import type { EvidenceRelation, SourceType } from "@ecotrace/shared";
import { normalizeQuery } from "../utils/url.js";

export interface EvidenceMatchResult {
  relation: EvidenceRelation;
  confidence: number;
  reason: string;
  isExcluded: boolean;
  exclusionReason: string | null;
}

/**
 * Known sister company / subsidiary / brand separation rules.
 * If auditing one entity, reports solely about a different entity cannot substantiate the claim.
 */
const CONGLOMERATE_DIVISIONS: Record<string, string[]> = {
  "tata power": ["tata motors", "tata consultancy services", "tcs", "tata steel", "tata chemicals", "tata communications", "tata consumer", "tata elxsi", "air india"],
  "tata motors": ["tata power", "tata consultancy services", "tcs", "tata steel", "tata chemicals"],
  "alphabet": ["waymo", "verily", "deepmind"],
};

/**
 * Checks whether evidence genuinely matches the entity being audited.
 */
export function checkEntityMatch(
  companyName: string,
  title: string,
  snippet: string,
): { matches: boolean; reason: string | null } {
  const normCompany = companyName.toLowerCase().trim();
  const text = `${title} ${snippet}`.toLowerCase();

  // 1. Check for explicit sister company mismatch in conglomerates (e.g. Tata Motors vs Tata Power)
  for (const [parentCompany, otherDivisions] of Object.entries(CONGLOMERATE_DIVISIONS)) {
    if (normCompany.includes(parentCompany)) {
      for (const division of otherDivisions) {
        // If snippet explicitly features the other division
        const mentionsOther = new RegExp(`\\b${escapeReg(division)}\\b`, "i").test(text);
        const mentionsTarget = new RegExp(`\\b${escapeReg(normCompany)}\\b`, "i").test(text);
        if (mentionsOther && !mentionsTarget) {
          return {
            matches: false,
            reason: `Source specifically addresses ${division.toUpperCase()} rather than ${companyName}.`,
          };
        }
      }
    }
  }

  // 2. Generic entity check:
  // If company is "Company A", and text explicitly references "Company B" (e.g. "Report on Company B") without Company A
  const companyTokens = normCompany.split(/\s+/).filter((t) => t.length > 2);
  const textNormalized = normalizeQuery(text);

  // If text doesn't mention the company name or any distinctive company token
  if (companyTokens.length > 0) {
    const hasAnyToken = companyTokens.some((tok) => textNormalized.includes(tok));
    if (!hasAnyToken) {
      return {
        matches: false,
        reason: `Source text does not mention ${companyName} or its recognized entity identifiers.`,
      };
    }
  }

  return { matches: true, reason: null };
}

/**
 * Evaluates whether retrieved evidence addresses the specific proposition
 * rather than an unrelated proposition or mere buzzwords.
 */
export function checkPropositionMatch(
  claimText: string,
  title: string,
  snippet: string,
  sourceType: SourceType,
): EvidenceMatchResult {
  const c = claimText.toLowerCase();
  const text = `${title} ${snippet}`.toLowerCase();

  // Conflict detection
  const conflictPatterns = [
    /\b(?:greenwash(?:ing)?|misleading|false\s+claim|fined\s+for|lawsuit|regulator\s+probes?|overstated?|accused\s+of\s+misleading|failed\s+to\s+meet|breached|violat(?:ed|ion))\b/i,
    /\b(?:independent\s+(?:testing|audit)\s+found|critics?\s+questioned|questions\s+remain|contradicts?|inaccurate)\b/i,
  ];
  const hasConflict = conflictPatterns.some((p) => p.test(text));

  // If conflict is present and relevant to the subject matter
  if (hasConflict) {
    // Check if the criticism pertains to environmental/sustainability claims
    if (/(?:emissions?|recycled|carbon|sustainab|green|climate|waste|energy|target)/i.test(text)) {
      return {
        relation: "CONTRADICTING",
        confidence: 0.8,
        reason: "Source substantively challenges or questions the asserted claim or performance.",
        isExcluded: false,
        exclusionReason: null,
      };
    }
  }

  // Scope 1 / Scope 2 / Scope 3 greenhouse gas proposition checking
  const isScopeEmissionsClaim = /\bscope\s*[123]\b/i.test(c) || /\b(?:ghg|greenhouse\s+gas)\b/i.test(c);
  if (isScopeEmissionsClaim) {
    // If the claim is about Scope 1/2/3 GHG emissions, IT reporting partnerships or unrelated operations are not supporting
    const isReportingSoftwareOnly = /\b(?:reporting\s+tool|reporting\s+software|partners?\s+with\s+[a-z\s]+\s+to\s+power\s+sustainability\s+reporting)\b/i.test(text);
    if (isReportingSoftwareOnly && !/\b(?:scope\s*[123]|\d+(?:\.\d+)?%|ghg|baseline|emissions?\s+reduction)\b/i.test(text)) {
      return {
        relation: "IRRELEVANT",
        confidence: 0.85,
        reason: "Source describes sustainability reporting software or partnership; does not evaluate Scope 1/2/3 emissions data or reduction targets.",
        isExcluded: true,
        exclusionReason: "Discusses reporting software partnership rather than Scope emissions accounting.",
      };
    }
  }

  // Topic-only / broad headline check (e.g. "Sustainable AI and its potential for net-zero")
  const isVagueThematicHeadline = /^(?:sustainable\s+[a-z0-9\s]+and\s+its\s+potential|overview\s+of|the\s+future\s+of|understanding)\b/i.test(c);
  if (isVagueThematicHeadline && !/\b(?:reduced|achieved|cut|fined|audited|investigated)\b/i.test(text)) {
    return {
      relation: "INSUFFICIENT",
      confidence: 0.65,
      reason: "Broad thematic discussion lacking testable factual metrics or verified corporate outcomes.",
      isExcluded: false,
      exclusionReason: null,
    };
  }

  // Check specific metric alignment if claim has quantitative targets (e.g., 70.5%, 40%, 100%)
  const metricMatch = c.match(/\b(\d+(?:\.\d+)?%)\b/);
  if (metricMatch) {
    const targetPercent = metricMatch[1];
    const hasExactPercent = text.includes(targetPercent.toLowerCase());
    if (hasExactPercent) {
      const isTargetAnnouncement = /\b(?:target(?:s|ing)?|aim(?:s|ing)?|by\s+20\d{2}|goal)\b/i.test(c);
      if (isTargetAnnouncement) {
        return {
          relation: "SUPPORTING",
          confidence: 0.85,
          reason: `Source explicitly corroborates the stated ${targetPercent} commitment and timeline.`,
          isExcluded: false,
          exclusionReason: null,
        };
      }
      return {
        relation: "SUPPORTING",
        confidence: 0.8,
        reason: `Source documents the quantitative metric (${targetPercent}) asserted in the claim.`,
        isExcluded: false,
        exclusionReason: null,
      };
    }
  }

  // Company promotional statements vs Independent proof (Case B)
  if (sourceType === "OFFICIAL_COMPANY") {
    // If marketing page repeating slogan (e.g. "promotes sustainability")
    if (/(?:our\s+approach|committed\s+to\s+sustainability|leading\s+the\s+way|proud\s+to\s+support)/i.test(text) && !/\b(?:\d+%(?:|\s+reduction)|audited|verified|certified|kwh|mwh|tonnes?)\b/i.test(text)) {
      return {
        relation: "INSUFFICIENT",
        confidence: 0.7,
        reason: "Company marketing statement repeats sustainability commitment without independent or quantifiable verification data.",
        isExcluded: false,
        exclusionReason: null,
      };
    }
    return {
      relation: "SUPPORTING",
      confidence: 0.65,
      reason: "Official corporate disclosure documents the stated commitment or operational initiative.",
      isExcluded: false,
      exclusionReason: null,
    };
  }

  // Supporting evidence from independent or news sources
  const strongSupportPatterns = [
    /\b(?:achieved|reduced\s+emissions|certified\s+by|third-party\s+audit|verified\s+by|approved\s+by\s+sbti|cdp\s+score|statutory\s+filing|reported\s+(?:a\s+)?\d+%\s+reduction)\b/i,
  ];
  if (strongSupportPatterns.some((p) => p.test(text))) {
    return {
      relation: "SUPPORTING",
      confidence: 0.75,
      reason: "Independent source documents verifiable operational outcomes aligned with the claim.",
      isExcluded: false,
      exclusionReason: null,
    };
  }

  // Substantive keyword overlap requirement (must share at least 2 distinct substantive non-stop concepts)
  const claimWords = c
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w));
  const matchedWords = claimWords.filter((w) => text.includes(w));

  if (matchedWords.length >= 3) {
    return {
      relation: "SUPPORTING",
      confidence: 0.6,
      reason: "Retrieved source text directly aligns with the core proposition.",
      isExcluded: false,
      exclusionReason: null,
    };
  }

  if (matchedWords.length >= 1) {
    return {
      relation: "INSUFFICIENT",
      confidence: 0.5,
      reason: "Source mentions related terminology but does not contain sufficient facts to verify the specific proposition.",
      isExcluded: false,
      exclusionReason: null,
    };
  }

  return {
    relation: "IRRELEVANT",
    confidence: 0.7,
    reason: "Source text does not meaningfully address the claim proposition.",
    isExcluded: true,
    exclusionReason: "Low topical relevance to claim proposition.",
  };
}

const STOP_WORDS = new Set([
  "that", "this", "with", "from", "have", "been", "were", "what", "when", "where",
  "which", "while", "about", "their", "there", "these", "those", "report", "sustainability",
  "environmental", "company", "corporation", "services", "global", "energy",
]);

function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
