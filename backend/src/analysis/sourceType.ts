import type { SearchEngine, SourceType } from "@ecotrace/shared";

const GOV = /\.(gov|gov\.[a-z]{2}|europa\.eu|who\.int|un\.org|ipcc\.ch)$/i;
const EDU = /\.(edu|ac\.[a-z]{2})$/i;
const NGO =
  /(greenpeace|wwf|nrdc|sierraclub|edf\.org|carbontrust|sciencebasedtargets|cdp\.net|wri\.org)/i;
const NEWS =
  /(reuters|bloomberg|nytimes|washingtonpost|theguardian|bbc\.|ft\.com|wsj\.|apnews|npr\.org|forbes|cnn\.|aljazeera)/i;
const INDUSTRY = /(businesswire|prnewswire|globenewswire|industryweek)/i;

export function classifySourceType(opts: {
  domain: string;
  engine: SearchEngine;
  companyDomain?: string | null;
  title?: string;
  metadata?: Record<string, unknown>;
}): SourceType {
  const domain = opts.domain.toLowerCase();

  // Metadata type overrides take highest priority — set by extractors for new engine types
  if (opts.metadata?.type === "ad_claim") return "AD_CLAIM";
  if (opts.metadata?.type === "patent") return "PATENT";
  if (opts.metadata?.type === "forum") return "FORUM";
  if (opts.metadata?.type === "video_transcript") return "VIDEO_TRANSCRIPT";

  if (opts.engine === "google_ads_transparency") return "AD_CLAIM";
  if (opts.engine === "google_patents") return "PATENT";
  if (opts.engine === "google_forums") return "FORUM";
  if (opts.engine === "youtube") return "VIDEO_TRANSCRIPT";

  if (opts.engine === "google_scholar") return "SCIENTIFIC";
  if (opts.engine === "google_shopping") return "PRODUCT";
  if (opts.engine === "google_trends") return "OTHER";
  if (opts.companyDomain && (domain === opts.companyDomain || domain.endsWith(`.${opts.companyDomain}`))) {
    return "OFFICIAL_COMPANY";
  }
  if (GOV.test(domain)) return "GOVERNMENT";
  if (EDU.test(domain) || /pubmed|nature\.com|sciencedirect|springer|arxiv/.test(domain)) return "ACADEMIC";
  if (NGO.test(domain)) return "NGO";
  if (opts.engine === "google_news" || NEWS.test(domain)) return "NEWS";
  if (INDUSTRY.test(domain) || /sustainability.report|ir\./.test(domain)) return "INDUSTRY";
  if (/medium\.com|substack|wordpress|blogspot/.test(domain)) return "BLOG";
  return "OTHER";
}

export function sourceQualityBaseline(type: SourceType): number {
  switch (type) {
    case "GOVERNMENT":
    case "SCIENTIFIC":
    case "ACADEMIC":
      return 0.9;
    case "NGO":
      return 0.78;
    case "NEWS":
      return 0.72;
    case "PATENT":
      return 0.82;
    case "INDUSTRY":
      return 0.55;
    case "OFFICIAL_COMPANY":
      return 0.62;
    case "PRODUCT":
      return 0.5;
    case "FORUM":
      return 0.38;
    case "VIDEO_TRANSCRIPT":
      return 0.5;
    case "AD_CLAIM":
      return 0.3;
    case "BLOG":
      return 0.28;
    default:
      return 0.4;
  }
}

export function independenceBaseline(type: SourceType): number {
  switch (type) {
    case "GOVERNMENT":
    case "SCIENTIFIC":
    case "ACADEMIC":
      return 0.92;
    case "NGO":
      return 0.8;
    case "NEWS":
      return 0.7;
    case "PATENT":
      return 0.65;
    case "FORUM":
      return 0.75;
    case "VIDEO_TRANSCRIPT":
      return 0.5;
    case "INDUSTRY":
      return 0.35;
    case "PRODUCT":
      return 0.45;
    case "BLOG":
      return 0.3;
    case "AD_CLAIM":
      return 0.1;
    case "OFFICIAL_COMPANY":
      return 0.15;
    default:
      return 0.4;
  }
}
