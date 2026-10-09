export const AUDIT_MODES = ["quick", "deep"] as const;
export type AuditMode = (typeof AUDIT_MODES)[number];

export const AUDIT_STATUSES = [
  "queued",
  "running",
  "completed",
  "partial",
  "failed",
] as const;
export type AuditStatus = (typeof AUDIT_STATUSES)[number];

export const AUDIT_STAGES = [
  "queued",
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
  "scanning_ads",
  "scanning_patents",
  "scanning_community",
  "scanning_video",
  "completed",
] as const;
export type AuditStage = (typeof AUDIT_STAGES)[number];

export const SEARCH_ENGINES = [
  "google",
  "google_news",
  "google_scholar",
  "google_shopping",
  "google_trends",
  "google_ads_transparency",
  "google_patents",
  "google_forums",
  "youtube",
] as const;
export type SearchEngine = (typeof SEARCH_ENGINES)[number];

export const CLAIM_CATEGORIES = [
  "CARBON",
  "ENERGY",
  "MATERIALS",
  "PACKAGING",
  "WATER",
  "WASTE",
  "RECYCLING",
  "SUPPLY_CHAIN",
  "BIODIVERSITY",
  "CLIMATE",
  "GENERAL_ENVIRONMENT",
] as const;
export type ClaimCategory = (typeof CLAIM_CATEGORIES)[number];

export const CLAIM_STATUSES = [
  "SUPPORTED",
  "PARTIALLY_SUPPORTED",
  "EVIDENCE_CONFLICT",
  "INSUFFICIENT_EVIDENCE",
  "NEEDS_HUMAN_REVIEW",
  "PENDING",
] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export const EVIDENCE_RELATIONS = [
  "SUPPORTING",
  "CONTRADICTING",
  "MIXED",
  "IRRELEVANT",
  "INSUFFICIENT",
] as const;
export type EvidenceRelation = (typeof EVIDENCE_RELATIONS)[number];

export const SOURCE_TYPES = [
  "OFFICIAL_COMPANY",
  "NEWS",
  "SCIENTIFIC",
  "PRODUCT",
  "GOVERNMENT",
  "NGO",
  "ACADEMIC",
  "INDUSTRY",
  "BLOG",
  "OTHER",
  "PATENT",
  "FORUM",
  "VIDEO_TRANSCRIPT",
  "AD_CLAIM",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const FRESHNESS_BANDS = [
  "FRESH",
  "RECENT",
  "OLDER",
  "HISTORICAL",
  "UNKNOWN",
] as const;
export type FreshnessBand = (typeof FRESHNESS_BANDS)[number];

export const ENGINE_STATUSES = ["pending", "running", "success", "failed", "skipped"] as const;
export type EngineStatus = (typeof ENGINE_STATUSES)[number];
