import type {
  AuditMode,
  AuditStage,
  AuditStatus,
  ClaimCategory,
  ClaimStatus,
  EngineStatus,
  EvidenceRelation,
  FreshnessBand,
  SearchEngine,
  SourceType,
} from "./enums.js";

export interface Company {
  id: string;
  name: string;
  officialDomain: string | null;
  aliases: string[];
  industry: string | null;
  country: string | null;
}

export interface CompanyCandidate {
  name: string;
  domain: string | null;
  snippet: string;
  url: string | null;
  score: number;
}

export interface Audit {
  id: string;
  companyId: string;
  companyName: string;
  mode: AuditMode;
  status: AuditStatus;
  stage: AuditStage;
  mockMode: boolean;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  error: string | null;
  notes: string[];
}

export interface AuditEngineState {
  engine: SearchEngine;
  status: EngineStatus;
  error: string | null;
  retryCount: number;
  requestCount: number;
  resultCount: number;
}

export interface Claim {
  id: string;
  auditId: string;
  text: string;
  category: ClaimCategory;
  sourceUrl: string | null;
  sourceName: string | null;
  discoveredAt: string;
  claimDate: string | null;
  specificityScore: number;
  importanceScore: number;
  status: ClaimStatus;
  integrityScore: number | null;
  explanation: string | null;
}

export interface Subclaim {
  id: string;
  claimId: string;
  text: string;
  testQuestion: string;
  category: ClaimCategory;
  status: ClaimStatus;
}

export interface EvidenceSource {
  id: string;
  title: string;
  url: string;
  snippet: string;
  sourceName: string;
  publishedAt: string | null;
  retrievedAt: string;
  engine: SearchEngine;
  query: string;
  domain: string;
  sourceType: SourceType;
  metadata: Record<string, unknown>;
}

export interface Evidence {
  id: string;
  subclaimId: string;
  claimId: string;
  title: string;
  url: string;
  domain: string;
  snippet: string;
  sourceName: string;
  publishedAt: string | null;
  retrievedAt: string;
  engine: SearchEngine;
  sourceType: SourceType;
  relation: EvidenceRelation;
  relevanceScore: number;
  independenceScore: number;
  freshnessScore: number;
  freshnessBand: FreshnessBand;
  explanation: string;
  clusterId: string | null;
}

export interface SourceCluster {
  clusterId: string;
  canonicalSource: string;
  domains: string[];
  similarity: number;
  independenceScore: number;
}

export interface SearchRequestRecord {
  id: string;
  auditId: string;
  engine: SearchEngine;
  query: string;
  requestedAt: string;
  status: "success" | "error" | "cached" | "skipped" | "no_results" | "recovered" | "invalid_query" | "timeout" | "network_error" | "provider_error" | "auth_error" | "rate_limited" | "unknown_error";
  responseHash: string | null;
  resultCount: number;
  creditsUsed: number;
  cached: boolean;
  error: string | null;
  latencyMs: number;
  claimId: string | null;
  purpose: string;
}

export interface ClaimEvent {
  id: string;
  claimId: string;
  eventDate: string | null;
  text: string;
  sourceUrl: string | null;
  note: string;
}

export interface EvidenceGap {
  claimId: string;
  missing: string[];
  requiredToSubstantiate: string;
}

export interface AuditMetrics {
  auditId: string;
  claimIntegrity: number;
  evidenceCoverage: number;
  sourceIndependence: number;
  evidenceConflict: number;
  evidenceFreshness: number;
  claimSpecificity: number;
  evidenceGap: number;
  publicAttention: number | null;
  evidenceCount: number;
  sourceCount: number;
  claimCount: number;
  enginesUsed: SearchEngine[];
  requestsUsed: number;
  requestsCached: number;
  requestsEstimated: number;
  remainingBudget: number;
}

export interface GraphNode {
  id: string;
  type: "company" | "claim" | "subclaim" | "evidence" | "source";
  label: string;
  data: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relation: "SUPPORTS" | "CONTRADICTS" | "RELATES_TO";
  label: string;
  data: Record<string, unknown>;
}

export interface EvidenceGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface CreditSnapshot {
  used: number;
  cached: number;
  remaining: number;
  estimated: number;
  globalUsed: number;
  globalRemaining: number;
}

export const DISCLAIMER =
  "EcoTrace is an analytical research tool. Its results are based on publicly available information and automated evidence analysis. Results are not legal, regulatory, scientific certification, or proof of wrongdoing. Human review is recommended for consequential decisions.";
